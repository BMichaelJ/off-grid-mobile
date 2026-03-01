import { InferenceSession } from 'onnxruntime-react-native';
import type { DetectorConfig } from '../../types';
import type { DetectionOutput, EmbeddingOutput, LoadedModel, ModelType } from './types';
import logger from '../../utils/logger';

class OnnxInferenceService {
  private loadedModels: Map<string, LoadedModel> = new Map();

  async loadModel(modelPath: string, type: ModelType): Promise<void> {
    if (this.loadedModels.has(modelPath)) {
      return;
    }
    const session = await InferenceSession.create(modelPath);
    this.loadedModels.set(modelPath, { type, modelPath, session });
    logger.log(`[OnnxInference] Loaded ${type} model: ${modelPath}`);
  }

  // TODO(P0): Wire real ONNX inference. These stubs return empty results.
  // Implementation requires:
  // 1. Image-to-tensor conversion (pixel extraction from URI → Float32Array)
  //    using react-native-image-manipulator or a custom native module
  // 2. Running the ONNX session with the tensor input
  // 3. Parsing output tensors via postprocessing.ts (already implemented)
  // Until this is wired, the pipeline will always return zero detections.
  async runDetection(
    _imageUri: string,
    _detectorModelPath: string,
    _config: DetectorConfig,
  ): Promise<DetectionOutput> {
    return { results: [], inferenceTimeMs: 0 };
  }

  // TODO(P0): Wire real embedding extraction. Returns empty embedding.
  // Same image-to-tensor requirement as runDetection above.
  async extractEmbedding(
    _croppedImageUri: string,
    _miewidModelPath: string,
  ): Promise<EmbeddingOutput> {
    return { embedding: [], inferenceTimeMs: 0 };
  }

  async unloadModel(modelPath: string): Promise<void> {
    const loaded = this.loadedModels.get(modelPath);
    if (!loaded) {
      return;
    }
    const session = loaded.session as InferenceSession;
    await session.release();
    this.loadedModels.delete(modelPath);
    logger.log(`[OnnxInference] Unloaded model: ${modelPath}`);
  }

  isModelLoaded(modelPath: string): boolean {
    return this.loadedModels.has(modelPath);
  }

  async unloadAll(): Promise<void> {
    for (const modelPath of this.loadedModels.keys()) {
      await this.unloadModel(modelPath);
    }
  }
}

export const onnxInferenceService = new OnnxInferenceService();
