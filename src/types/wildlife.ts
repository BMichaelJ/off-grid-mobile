// === Embedding Pack Types ===

export interface EmbeddingPackManifest {
  formatVersion: string;
  species: string;
  featureClass: string;
  displayName: string;
  description?: string;
  wildbookInstanceUrl: string;
  exportDate: string;
  individualCount: number;
  embeddingCount: number;
  embeddingDim: number;
  embeddingModel: {
    name: string;
    version: string;
    huggingFaceRepo?: string;
    inputSize: [number, number];
    normalize: {
      mean: [number, number, number];
      std: [number, number, number];
    };
  };
  detectorModel: {
    filename: string;
    configFile: string;
  };
  checksums?: Record<string, string>;
}

export interface DetectorConfig {
  modelFile: string;
  architecture: string;
  inputSize: [number, number];
  inputChannels: number;
  channelOrder: 'RGB' | 'BGR';
  normalize: {
    mean: [number, number, number];
    std: [number, number, number];
    scale: number;
  };
  confidenceThreshold: number;
  nmsThreshold: number;
  maxDetections: number;
  outputFormat: string;
  classLabels: string[];
  outputSpec: {
    boxFormat: 'xyxy' | 'xywh' | 'cxcywh';
    coordinateType: 'normalized' | 'absolute';
    outputTensorName?: string;
    layout: string;
  };
}

export interface EmbeddingPack {
  id: string;
  species: string;
  featureClass: string;
  displayName: string;
  wildbookInstanceUrl: string;
  exportDate: string;
  individualCount: number;
  embeddingDim: number;
  embeddingModelVersion: string;
  detectorModelFile: string;
  embeddingsFile: string;
  indexFile: string;
  referencePhotosDir: string;
  packDir: string;
  downloadedAt: string;
  sizeBytes: number;
}

export interface PackIndividual {
  id: string;
  name: string | null;
  alternateId: string | null;
  sex: 'male' | 'female' | 'unknown' | null;
  lifeStage: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  encounterCount: number;
  embeddingCount: number;
  embeddingOffset: number;
  referencePhotos: string[];
  notes: string | null;
}

// === Local Individual Types ===

export interface LocalIndividual {
  localId: string;
  userLabel: string | null;
  species: string;
  embeddings: number[][];
  referencePhotos: string[];
  firstSeen: string;
  encounterCount: number;
  syncStatus: 'pending' | 'synced';
  wildbookId: string | null;
}

// === Observation Types ===

export interface Observation {
  id: string;
  photoUri: string;
  gps: {
    lat: number;
    lon: number;
    accuracy: number;
  } | null;
  timestamp: string;
  deviceInfo: {
    model: string;
    os: string;
  };
  fieldNotes: string | null;
  detections: Detection[];
  createdAt: string;
}

export interface Detection {
  id: string;
  observationId: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  species: string;
  speciesConfidence: number;
  croppedImageUri: string;
  embedding: number[];
  matchResult: {
    topCandidates: MatchCandidate[];
    approvedIndividual: string | null;
    reviewStatus: 'pending' | 'approved' | 'rejected';
  };
  encounterFields: EncounterFields;
}

export interface MatchCandidate {
  individualId: string;
  score: number;
  source: 'pack' | 'local';
  refPhotoIndex: number;
}

export interface EncounterFields {
  locationId: string | null;
  sex: string | null;
  lifeStage: string | null;
  behavior: string | null;
  submitterId: string | null;
  projectId: string | null;
}

// === Sync Types ===

export type SyncStatus =
  | 'pending'
  | 'uploading'
  | 'synced'
  | 'failed'
  | 'failedPermanent';

export interface SyncQueueItem {
  observationId: string;
  status: SyncStatus;
  wildbookInstanceUrl: string;
  retryCount: number;
  lastError: string | null;
  lastAttempt: string | null;
  syncedAt: string | null;
  wildbookEncounterIds: string[];
}

// === Inference Types ===

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  boundingBox: BoundingBox;
  species: string;
  confidence: number;
}
