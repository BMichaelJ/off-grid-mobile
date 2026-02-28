import type { DetectionResult } from '../../types';

export type ModelType = 'detector' | 'embedding';

export interface LoadedModel {
  type: ModelType;
  modelPath: string;
  session: unknown; // InferenceSession
}

export interface DetectionOutput {
  results: DetectionResult[];
  inferenceTimeMs: number;
}

export interface EmbeddingOutput {
  embedding: number[];
  inferenceTimeMs: number;
}
