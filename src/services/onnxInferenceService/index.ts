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

  async runDetection(
    _imageUri: string,
    _detectorModelPath: string,
    _config: DetectorConfig,
  ): Promise<DetectionOutput> {
    return { results: [], inferenceTimeMs: 0 };
  }

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
