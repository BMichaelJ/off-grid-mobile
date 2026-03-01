import type { DetectorConfig, Detection } from '../../types';
import type { EmbeddingDatabaseEntry } from '../embeddingMatchService/types';

export interface SpeciesConfig {
  packId: string;
  species: string;
  detectorModelPath: string;
  detectorConfig: DetectorConfig;
  embeddingDatabase: EmbeddingDatabaseEntry[];
}

export interface ProcessPhotoParams {
  photoUri: string;
  speciesConfigs: SpeciesConfig[];
  miewidModelPath: string;
  embeddingInputSize?: [number, number];
  embeddingNormalize?: {
    mean: [number, number, number];
    std: [number, number, number];
  };
}

export interface PipelineResult {
  observationId: string;
  photoUri: string;
  detections: Detection[];
  totalInferenceTimeMs: number;
}
