import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { DetectorConfig } from '../../types';
import type { DetectionOutput, EmbeddingOutput, LoadedModel, ModelType } from './types';
import { preprocessImageForDetection, preprocessImageForEmbedding } from './preprocessing';
import { parseYoloOutput } from './postprocessing';
import logger from '../../utils/logger';

interface ActiveOps {
  count: number;
  idleWaiters: Array<() => void>;
}

class OnnxInferenceService {
  private loadedModels: Map<string, LoadedModel> = new Map();
  private loadingPromises: Map<string, Promise<void>> = new Map();
  private activeOps: Map<string, ActiveOps> = new Map();

  /** Mark an inference as in-flight so unload waits for it. */
  private beginOp(modelPath: string): void {
    const ops = this.activeOps.get(modelPath) ?? { count: 0, idleWaiters: [] };
    ops.count += 1;
    this.activeOps.set(modelPath, ops);
  }

  private endOp(modelPath: string): void {
    const ops = this.activeOps.get(modelPath);
    if (!ops) {
      return;
    }
    ops.count -= 1;
    if (ops.count <= 0) {
      this.activeOps.delete(modelPath);
      ops.idleWaiters.forEach((resolve) => resolve());
    }
  }

  /** Resolves once no inference is running against the model. */
  private waitForIdle(modelPath: string): Promise<void> {
    const ops = this.activeOps.get(modelPath);
    if (!ops || ops.count <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      ops.idleWaiters.push(resolve);
    });
  }

  async loadModel(modelPath: string, type: ModelType): Promise<void> {
    if (this.loadedModels.has(modelPath)) {
      return;
    }
    // Deduplicate concurrent loads of the same path: without this, both
    // callers pass the has() check above, create two native sessions, and the
    // second set() orphans (leaks) the first session.
    const inFlight = this.loadingPromises.get(modelPath);
    if (inFlight) {
      return inFlight;
    }
    const loading = (async () => {
      const session = await InferenceSession.create(modelPath);
      this.loadedModels.set(modelPath, { type, modelPath, session });
      logger.log(`[OnnxInference] Loaded ${type} model: ${modelPath}`);
    })().finally(() => {
      this.loadingPromises.delete(modelPath);
    });
    this.loadingPromises.set(modelPath, loading);
    return loading;
  }

  /**
   * Run object detection on a full photo.
   *
   * 1. Preprocesses the image into a normalized NCHW tensor via the native module
   * 2. Runs the ONNX detector session
   * 3. Parses YOLO output with NMS via postprocessing
   */
  async runDetection(
    imageUri: string,
    detectorModelPath: string,
    config: DetectorConfig,
  ): Promise<DetectionOutput> {
    const loaded = this.loadedModels.get(detectorModelPath);
    if (!loaded) {
      throw new Error(`Detector model not loaded: ${detectorModelPath}`);
    }

    const session = loaded.session as InferenceSession;
    const [height, width] = config.inputSize;

    this.beginOp(detectorModelPath);
    try {
      // Preprocess: image URI → normalized Float32Array in NCHW layout
      const tensorData = await preprocessImageForDetection(imageUri, config);

      // Create input tensor: [batch=1, channels, height, width]
      const inputTensor = new Tensor(
        'float32',
        tensorData,
        [1, config.inputChannels, height, width],
      );

      // Discover tensor names from the session
      const inputName = session.inputNames[0];
      const outputName =
        config.outputSpec.outputTensorName ?? session.outputNames[0];

      // Run inference
      const startTime = Date.now();
      const results = await session.run({ [inputName]: inputTensor });
      const inferenceTimeMs = Date.now() - startTime;

      // Extract output tensor data
      const outputTensor = results[outputName];
      const outputData = new Float32Array(
        outputTensor.data as ArrayLike<number>,
      );

      // Parse YOLO output (NMS, confidence filtering, box conversion)
      const detections = parseYoloOutput(outputData, config, { width, height });

      logger.log(
        `[OnnxInference] Detection: ${detections.length} results in ${inferenceTimeMs}ms`,
      );

      return { results: detections, inferenceTimeMs };
    } finally {
      this.endOp(detectorModelPath);
    }
  }

  /**
   * Extract a MiewID embedding from a cropped detection image.
   *
   * 1. Preprocesses the cropped image into a normalized NCHW tensor
   * 2. Runs the MiewID ONNX session
   * 3. Returns the embedding vector
   */
  async extractEmbedding(
    croppedImageUri: string,
    miewidModelPath: string,
    opts?: {
      inputSize?: [number, number];
      normalize?: {
        mean: [number, number, number];
        std: [number, number, number];
      };
    },
  ): Promise<EmbeddingOutput> {
    const loaded = this.loadedModels.get(miewidModelPath);
    if (!loaded) {
      throw new Error(`Embedding model not loaded: ${miewidModelPath}`);
    }

    const session = loaded.session as InferenceSession;

    this.beginOp(miewidModelPath);
    try {
      // Preprocess: cropped image → normalized Float32Array
      const size = opts?.inputSize ?? [440, 440];
      const tensorData = await preprocessImageForEmbedding(
        croppedImageUri,
        size,
        opts?.normalize,
      );

      const [h, w] = size;
      const inputTensor = new Tensor('float32', tensorData, [1, 3, h, w]);

      const inputName = session.inputNames[0];

      // Run inference
      const startTime = Date.now();
      const results = await session.run({ [inputName]: inputTensor });
      const inferenceTimeMs = Date.now() - startTime;

      // Extract embedding from first output tensor
      const outputName = session.outputNames[0];
      const embeddingTensor = results[outputName];
      const embedding = Array.from(embeddingTensor.data as Float32Array);

      logger.log(
        `[OnnxInference] Embedding: ${embedding.length}-dim in ${inferenceTimeMs}ms`,
      );

      return { embedding, inferenceTimeMs };
    } finally {
      this.endOp(miewidModelPath);
    }
  }

  /**
   * Release a model's native session. Safe against in-flight inference: the
   * model is removed from the registry first (new operations fail fast with
   * "not loaded"), then release waits for active operations to drain — the
   * native session is never freed under a running inference.
   */
  async unloadModel(modelPath: string): Promise<void> {
    const loaded = this.loadedModels.get(modelPath);
    if (!loaded) {
      return;
    }
    this.loadedModels.delete(modelPath);
    await this.waitForIdle(modelPath);
    const session = loaded.session as InferenceSession;
    await session.release();
    logger.log(`[OnnxInference] Unloaded model: ${modelPath}`);
  }

  isModelLoaded(modelPath: string): boolean {
    return this.loadedModels.has(modelPath);
  }

  async unloadAll(): Promise<void> {
    // Snapshot first — unloadModel mutates the map while we iterate.
    const modelPaths = Array.from(this.loadedModels.keys());
    for (const modelPath of modelPaths) {
      await this.unloadModel(modelPath);
    }
  }
}

export const onnxInferenceService = new OnnxInferenceService();
