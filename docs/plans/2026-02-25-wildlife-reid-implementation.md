# Wildlife Re-ID Mobile App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fork Off Grid Mobile into a wildlife re-identification app that detects animals via ONNX models, extracts MiewID embeddings, matches against local + pack databases, and queues observations for Wildbook sync.

**Architecture:** Layered service architecture following Off Grid's patterns — singleton services for ONNX inference and embedding matching, Zustand stores for state persistence, React Native screens with custom hooks. ONNX Runtime handles all ML inference cross-platform.

**Tech Stack:** React Native 0.83, TypeScript, Zustand 5, onnxruntime-react-native, react-native-image-picker, React Navigation 7

**Design Doc:** [docs/plans/2026-02-25-wildlife-reid-design.md](./2026-02-25-wildlife-reid-design.md)
**Embedding Pack Spec:** [docs/EMBEDDING_PACK_FORMAT.md](../EMBEDDING_PACK_FORMAT.md)

---

## Phase 0: Project Setup & Fork Preparation

### Task 0.1: Install onnxruntime-react-native

**Files:**
- Modify: `package.json`
- Modify: `ios/Podfile`

**Step 1: Install the package**

Run: `npm install onnxruntime-react-native`

**Step 2: Install iOS pods**

Run: `cd ios && pod install && cd ..`

**Step 3: Verify installation**

Run: `npx tsc --noEmit`
Expected: No type errors related to onnxruntime

**Step 4: Commit**

```bash
git add package.json package-lock.json ios/Podfile ios/Podfile.lock
git commit -m "chore: install onnxruntime-react-native"
```

---

### Task 0.2: Add wildlife re-ID type definitions

**Files:**
- Create: `src/types/wildlife.ts`
- Modify: `src/types/index.ts`

**Step 1: Write the types file**

Create `src/types/wildlife.ts` with all wildlife-specific types from the design doc:

```typescript
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
```

**Step 2: Export from barrel**

Add to `src/types/index.ts`:

```typescript
export type {
  EmbeddingPackManifest,
  DetectorConfig,
  EmbeddingPack,
  PackIndividual,
  LocalIndividual,
  Observation,
  Detection,
  MatchCandidate,
  EncounterFields,
  SyncStatus,
  SyncQueueItem,
  BoundingBox,
  DetectionResult,
} from './wildlife';
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS, no errors

**Step 4: Commit**

```bash
git add src/types/wildlife.ts src/types/index.ts
git commit -m "feat: add wildlife re-ID type definitions"
```

---

## Phase 1: Core Services (ONNX Inference + Embedding Matching)

### Task 1.1: Create ONNX inference service — types and skeleton

**Files:**
- Create: `src/services/onnxInferenceService/types.ts`
- Create: `src/services/onnxInferenceService/index.ts`
- Modify: `src/services/index.ts`

**Step 1: Write the failing test**

Create `__tests__/unit/services/onnxInferenceService.test.ts`:

```typescript
import { onnxInferenceService } from '../../../src/services/onnxInferenceService';

// Mock onnxruntime-react-native
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: {
    create: jest.fn(),
  },
  Tensor: jest.fn(),
}));

describe('OnnxInferenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export a singleton instance', () => {
    expect(onnxInferenceService).toBeDefined();
    expect(typeof onnxInferenceService.loadModel).toBe('function');
    expect(typeof onnxInferenceService.runDetection).toBe('function');
    expect(typeof onnxInferenceService.extractEmbedding).toBe('function');
    expect(typeof onnxInferenceService.unloadModel).toBe('function');
    expect(typeof onnxInferenceService.isModelLoaded).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unit/services/onnxInferenceService.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Write types file**

Create `src/services/onnxInferenceService/types.ts`:

```typescript
import type { DetectorConfig, DetectionResult } from '../../types';

export type ModelType = 'detector' | 'embedding';

export interface LoadedModel {
  type: ModelType;
  modelPath: string;
  session: unknown; // InferenceSession — typed as unknown to avoid import in types
}

export interface DetectionOutput {
  results: DetectionResult[];
  inferenceTimeMs: number;
}

export interface EmbeddingOutput {
  embedding: number[];
  inferenceTimeMs: number;
}
```

**Step 4: Write service skeleton**

Create `src/services/onnxInferenceService/index.ts`:

```typescript
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { DetectorConfig, DetectionResult } from '../../types';
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
    // Stub — will be implemented in Task 1.2
    return { results: [], inferenceTimeMs: 0 };
  }

  async extractEmbedding(
    _croppedImageUri: string,
    _miewidModelPath: string,
  ): Promise<EmbeddingOutput> {
    // Stub — will be implemented in Task 1.3
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
```

**Step 5: Add to service barrel export**

Add to `src/services/index.ts`:

```typescript
export { onnxInferenceService } from './onnxInferenceService';
```

**Step 6: Run test to verify it passes**

Run: `npx jest __tests__/unit/services/onnxInferenceService.test.ts --no-coverage`
Expected: PASS

**Step 7: Commit**

```bash
git add src/services/onnxInferenceService/ __tests__/unit/services/onnxInferenceService.test.ts src/services/index.ts
git commit -m "feat: add ONNX inference service skeleton"
```

---

### Task 1.2: Implement detection inference

**Files:**
- Modify: `src/services/onnxInferenceService/index.ts`
- Create: `src/services/onnxInferenceService/preprocessing.ts`
- Create: `src/services/onnxInferenceService/postprocessing.ts`
- Test: `__tests__/unit/services/onnxInferenceService.test.ts`

**Step 1: Write failing tests for preprocessing**

Add to test file:

```typescript
import { preprocessImageForDetection } from '../../../src/services/onnxInferenceService/preprocessing';
import type { DetectorConfig } from '../../../src/types';

const mockDetectorConfig: DetectorConfig = {
  modelFile: 'detector.onnx',
  architecture: 'yolo11',
  inputSize: [640, 640],
  inputChannels: 3,
  channelOrder: 'RGB',
  normalize: { mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
  confidenceThreshold: 0.5,
  nmsThreshold: 0.45,
  maxDetections: 20,
  outputFormat: 'yolo',
  classLabels: ['horse_face'],
  outputSpec: {
    boxFormat: 'xyxy',
    coordinateType: 'normalized',
    layout: 'batch_detections_attributes',
  },
};

describe('preprocessImageForDetection', () => {
  it('should return a Float32Array with correct dimensions', async () => {
    const result = await preprocessImageForDetection(
      'file:///test/image.jpg',
      mockDetectorConfig,
    );
    expect(result).toBeInstanceOf(Float32Array);
    // 3 channels * 640 * 640
    expect(result.length).toBe(3 * 640 * 640);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unit/services/onnxInferenceService.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Implement preprocessing**

Create `src/services/onnxInferenceService/preprocessing.ts`:

```typescript
import { Image } from 'react-native';
import type { DetectorConfig } from '../../types';

/**
 * Preprocesses an image for detection model input.
 * Resizes to inputSize, scales pixels, normalizes channels.
 * Returns a Float32Array in NCHW format.
 */
export async function preprocessImageForDetection(
  imageUri: string,
  config: DetectorConfig,
): Promise<Float32Array> {
  const [height, width] = config.inputSize;
  const channels = config.inputChannels;
  const totalSize = channels * height * width;
  const tensor = new Float32Array(totalSize);

  // TODO: Actual image loading + pixel extraction requires a native module
  // or canvas-based approach. For MVP, this will be implemented with
  // react-native-image-manipulator or a custom native bridge.
  // This stub returns a zeroed tensor for testing the pipeline.

  return tensor;
}

/**
 * Preprocesses a cropped image for MiewID embedding extraction.
 * Resizes to 440x440, normalizes with ImageNet stats.
 * Returns a Float32Array in NCHW format.
 */
export async function preprocessImageForEmbedding(
  imageUri: string,
): Promise<Float32Array> {
  const height = 440;
  const width = 440;
  const channels = 3;
  const totalSize = channels * height * width;
  const tensor = new Float32Array(totalSize);

  // TODO: Same native pixel extraction needed.
  // ImageNet normalization: mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]

  return tensor;
}
```

**Step 4: Implement postprocessing**

Create `src/services/onnxInferenceService/postprocessing.ts`:

```typescript
import type { DetectorConfig, DetectionResult } from '../../types';

/**
 * Applies Non-Max Suppression to filter overlapping detections.
 */
function nms(
  detections: DetectionResult[],
  iouThreshold: number,
): DetectionResult[] {
  if (detections.length === 0) return [];

  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: DetectionResult[] = [];

  for (const det of sorted) {
    let shouldKeep = true;
    for (const kept_det of kept) {
      if (computeIoU(det.boundingBox, kept_det.boundingBox) > iouThreshold) {
        shouldKeep = false;
        break;
      }
    }
    if (shouldKeep) {
      kept.push(det);
    }
  }

  return kept;
}

function computeIoU(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Parses raw YOLO output tensor into DetectionResults.
 * Handles YOLO11/YOLOv8 output format.
 */
export function parseYoloOutput(
  outputData: Float32Array,
  config: DetectorConfig,
  originalWidth: number,
  originalHeight: number,
): DetectionResult[] {
  const numClasses = config.classLabels.length;
  const [inputH, inputW] = config.inputSize;

  // YOLO11 output shape: [1, 4+numClasses, numDetections]
  // After transpose: [numDetections, 4+numClasses]
  const stride = 4 + numClasses;
  const numDetections = outputData.length / stride;
  const raw: DetectionResult[] = [];

  for (let i = 0; i < numDetections; i++) {
    const offset = i * stride;

    // Extract box based on format
    let x: number, y: number, w: number, h: number;
    if (config.outputSpec.boxFormat === 'cxcywh') {
      const cx = outputData[offset];
      const cy = outputData[offset + 1];
      w = outputData[offset + 2];
      h = outputData[offset + 3];
      x = cx - w / 2;
      y = cy - h / 2;
    } else if (config.outputSpec.boxFormat === 'xyxy') {
      x = outputData[offset];
      y = outputData[offset + 1];
      w = outputData[offset + 2] - x;
      h = outputData[offset + 3] - y;
    } else {
      x = outputData[offset];
      y = outputData[offset + 1];
      w = outputData[offset + 2];
      h = outputData[offset + 3];
    }

    // Find best class
    let bestClassScore = 0;
    let bestClassIdx = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = outputData[offset + 4 + c];
      if (score > bestClassScore) {
        bestClassScore = score;
        bestClassIdx = c;
      }
    }

    if (bestClassScore < config.confidenceThreshold) continue;

    // Normalize coordinates if absolute
    const normX = config.outputSpec.coordinateType === 'absolute' ? x / inputW : x;
    const normY = config.outputSpec.coordinateType === 'absolute' ? y / inputH : y;
    const normW = config.outputSpec.coordinateType === 'absolute' ? w / inputW : w;
    const normH = config.outputSpec.coordinateType === 'absolute' ? h / inputH : h;

    raw.push({
      boundingBox: { x: normX, y: normY, width: normW, height: normH },
      species: config.classLabels[bestClassIdx],
      confidence: bestClassScore,
    });
  }

  // Apply NMS
  const filtered = nms(raw, config.nmsThreshold);

  // Limit detections
  return filtered.slice(0, config.maxDetections);
}
```

**Step 5: Write tests for postprocessing**

Add to test file:

```typescript
import { parseYoloOutput } from '../../../src/services/onnxInferenceService/postprocessing';

describe('parseYoloOutput', () => {
  const config: DetectorConfig = {
    modelFile: 'detector.onnx',
    architecture: 'yolo11',
    inputSize: [640, 640],
    inputChannels: 3,
    channelOrder: 'RGB',
    normalize: { mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
    confidenceThreshold: 0.5,
    nmsThreshold: 0.45,
    maxDetections: 20,
    outputFormat: 'yolo',
    classLabels: ['horse_face'],
    outputSpec: {
      boxFormat: 'cxcywh',
      coordinateType: 'absolute',
      layout: 'batch_detections_attributes',
    },
  };

  it('should return empty array for empty output', () => {
    const result = parseYoloOutput(new Float32Array(0), config, 1920, 1080);
    expect(result).toEqual([]);
  });

  it('should filter detections below confidence threshold', () => {
    // One detection: cx=320, cy=320, w=100, h=100, class0_score=0.3
    const data = new Float32Array([320, 320, 100, 100, 0.3]);
    const result = parseYoloOutput(data, config, 1920, 1080);
    expect(result).toEqual([]);
  });

  it('should parse a valid detection', () => {
    // cx=320, cy=320, w=100, h=100, class0_score=0.9
    const data = new Float32Array([320, 320, 100, 100, 0.9]);
    const result = parseYoloOutput(data, config, 1920, 1080);
    expect(result).toHaveLength(1);
    expect(result[0].species).toBe('horse_face');
    expect(result[0].confidence).toBe(0.9);
    // Normalized coords: (320-50)/640=0.421875, (320-50)/640=0.421875, 100/640=0.15625
    expect(result[0].boundingBox.x).toBeCloseTo(0.34375, 4);
    expect(result[0].boundingBox.width).toBeCloseTo(0.15625, 4);
  });

  it('should apply NMS to overlapping detections', () => {
    // Two overlapping detections
    const data = new Float32Array([
      320, 320, 100, 100, 0.9,  // detection 1
      325, 325, 100, 100, 0.8,  // detection 2, overlaps heavily
    ]);
    const result = parseYoloOutput(data, config, 1920, 1080);
    expect(result).toHaveLength(1); // NMS should suppress the lower-confidence one
    expect(result[0].confidence).toBe(0.9);
  });
});
```

**Step 6: Run tests**

Run: `npx jest __tests__/unit/services/onnxInferenceService.test.ts --no-coverage`
Expected: PASS

**Step 7: Commit**

```bash
git add src/services/onnxInferenceService/ __tests__/unit/services/onnxInferenceService.test.ts
git commit -m "feat: add detection preprocessing and YOLO postprocessing"
```

---

### Task 1.3: Implement embedding extraction and cosine matching

**Files:**
- Create: `src/services/embeddingMatchService/index.ts`
- Create: `src/services/embeddingMatchService/types.ts`
- Test: `__tests__/unit/services/embeddingMatchService.test.ts`

**Step 1: Write failing tests**

Create `__tests__/unit/services/embeddingMatchService.test.ts`:

```typescript
import { embeddingMatchService } from '../../../src/services/embeddingMatchService';

describe('EmbeddingMatchService', () => {
  it('should export a singleton instance', () => {
    expect(embeddingMatchService).toBeDefined();
    expect(typeof embeddingMatchService.matchEmbedding).toBe('function');
    expect(typeof embeddingMatchService.cosineSimilarity).toBe('function');
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      const score = embeddingMatchService.cosineSimilarity(vec, vec);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const score = embeddingMatchService.cosineSimilarity(a, b);
      expect(score).toBeCloseTo(0.0, 5);
    });

    it('should return -1.0 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      const score = embeddingMatchService.cosineSimilarity(a, b);
      expect(score).toBeCloseTo(-1.0, 5);
    });
  });

  describe('matchEmbedding', () => {
    it('should return top-N candidates ranked by score', () => {
      const queryEmbedding = [1, 0, 0, 0];
      const database = [
        { individualId: 'A', source: 'pack' as const, embeddings: [[1, 0, 0, 0]], refPhotoIndex: 0 },
        { individualId: 'B', source: 'pack' as const, embeddings: [[0, 1, 0, 0]], refPhotoIndex: 0 },
        { individualId: 'C', source: 'local' as const, embeddings: [[0.9, 0.1, 0, 0]], refPhotoIndex: 0 },
      ];

      const results = embeddingMatchService.matchEmbedding(queryEmbedding, database, 5);

      expect(results).toHaveLength(3);
      expect(results[0].individualId).toBe('A');
      expect(results[0].score).toBeCloseTo(1.0, 3);
      expect(results[1].individualId).toBe('C');
      expect(results[2].individualId).toBe('B');
    });

    it('should limit results to topN', () => {
      const query = [1, 0];
      const database = [
        { individualId: 'A', source: 'pack' as const, embeddings: [[1, 0]], refPhotoIndex: 0 },
        { individualId: 'B', source: 'pack' as const, embeddings: [[0, 1]], refPhotoIndex: 0 },
        { individualId: 'C', source: 'pack' as const, embeddings: [[0.5, 0.5]], refPhotoIndex: 0 },
      ];

      const results = embeddingMatchService.matchEmbedding(query, database, 2);
      expect(results).toHaveLength(2);
    });

    it('should match best embedding when individual has multiple', () => {
      const query = [1, 0, 0];
      const database = [
        {
          individualId: 'A',
          source: 'pack' as const,
          embeddings: [
            [0, 1, 0],   // poor match
            [0.95, 0.05, 0], // good match
          ],
          refPhotoIndex: 0,
        },
      ];

      const results = embeddingMatchService.matchEmbedding(query, database, 5);
      expect(results[0].score).toBeGreaterThan(0.9);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unit/services/embeddingMatchService.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Write the service**

Create `src/services/embeddingMatchService/types.ts`:

```typescript
import type { MatchCandidate } from '../../types';

export interface EmbeddingDatabaseEntry {
  individualId: string;
  source: 'pack' | 'local';
  embeddings: number[][];
  refPhotoIndex: number;
}
```

Create `src/services/embeddingMatchService/index.ts`:

```typescript
import type { MatchCandidate } from '../../types';
import type { EmbeddingDatabaseEntry } from './types';

class EmbeddingMatchService {
  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  matchEmbedding(
    queryEmbedding: number[],
    database: EmbeddingDatabaseEntry[],
    topN: number,
  ): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];

    for (const entry of database) {
      // Find best matching embedding for this individual
      let bestScore = -Infinity;
      for (const embedding of entry.embeddings) {
        const score = this.cosineSimilarity(queryEmbedding, embedding);
        if (score > bestScore) {
          bestScore = score;
        }
      }

      candidates.push({
        individualId: entry.individualId,
        score: bestScore,
        source: entry.source,
        refPhotoIndex: entry.refPhotoIndex,
      });
    }

    // Sort descending by score and limit to topN
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topN);
  }
}

export const embeddingMatchService = new EmbeddingMatchService();
```

**Step 4: Add to service barrel export**

Add to `src/services/index.ts`:

```typescript
export { embeddingMatchService } from './embeddingMatchService';
```

**Step 5: Run tests**

Run: `npx jest __tests__/unit/services/embeddingMatchService.test.ts --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/services/embeddingMatchService/ __tests__/unit/services/embeddingMatchService.test.ts src/services/index.ts
git commit -m "feat: add embedding match service with cosine similarity"
```

---

### Task 1.4: Create embedding pack manager service

**Files:**
- Create: `src/services/packManager/index.ts`
- Create: `src/services/packManager/types.ts`
- Test: `__tests__/unit/services/packManager.test.ts`

This service handles importing, parsing, and accessing embedding pack data from the filesystem.

**Step 1: Write failing tests**

Create `__tests__/unit/services/packManager.test.ts`:

```typescript
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn(),
  mkdir: jest.fn(),
  readFile: jest.fn(),
  readDir: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
}));

import RNFS from 'react-native-fs';
import { packManager } from '../../../src/services/packManager';

describe('PackManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export a singleton instance', () => {
    expect(packManager).toBeDefined();
    expect(typeof packManager.initialize).toBe('function');
    expect(typeof packManager.importPack).toBe('function');
    expect(typeof packManager.loadPackIndex).toBe('function');
    expect(typeof packManager.loadEmbeddings).toBe('function');
    expect(typeof packManager.deletePack).toBe('function');
  });

  describe('loadPackIndex', () => {
    it('should parse index.json and return PackIndividuals', async () => {
      const mockIndex = {
        formatVersion: '1.0',
        generatedWith: 'miewid-v4',
        individuals: [
          {
            id: 'WB-HORSE-001',
            name: 'Butterscotch',
            alternateId: null,
            sex: 'female',
            lifeStage: 'adult',
            firstSeen: '2024-06-15',
            lastSeen: '2026-02-10',
            encounterCount: 12,
            embeddingCount: 5,
            embeddingOffset: 0,
            referencePhotos: ['ref_01.jpg'],
            notes: null,
          },
        ],
      };

      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockIndex));

      const individuals = await packManager.loadPackIndex('/mock/pack/embeddings/index.json');

      expect(individuals).toHaveLength(1);
      expect(individuals[0].id).toBe('WB-HORSE-001');
      expect(individuals[0].name).toBe('Butterscotch');
      expect(individuals[0].embeddingCount).toBe(5);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unit/services/packManager.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Write the service**

Create `src/services/packManager/types.ts`:

```typescript
export interface PackIndexFile {
  formatVersion: string;
  generatedWith: string;
  individuals: import('../../types').PackIndividual[];
}
```

Create `src/services/packManager/index.ts`:

```typescript
import RNFS from 'react-native-fs';
import type { EmbeddingPack, EmbeddingPackManifest, PackIndividual } from '../../types';
import type { PackIndexFile } from './types';
import logger from '../../utils/logger';

const PACKS_DIR = `${RNFS.DocumentDirectoryPath}/embedding_packs`;

class PackManager {
  async initialize(): Promise<void> {
    const exists = await RNFS.exists(PACKS_DIR);
    if (!exists) {
      await RNFS.mkdir(PACKS_DIR);
    }
    logger.log('[PackManager] Initialized packs directory');
  }

  async importPack(_zipUri: string): Promise<EmbeddingPack> {
    // TODO: Implement zip extraction and manifest parsing
    // For MVP, packs will be pre-extracted to PACKS_DIR
    throw new Error('Not yet implemented — use pre-extracted packs for MVP');
  }

  async loadPackIndex(indexFilePath: string): Promise<PackIndividual[]> {
    const content = await RNFS.readFile(indexFilePath, 'utf8');
    const parsed: PackIndexFile = JSON.parse(content);
    return parsed.individuals;
  }

  async loadManifest(manifestPath: string): Promise<EmbeddingPackManifest> {
    const content = await RNFS.readFile(manifestPath, 'utf8');
    return JSON.parse(content);
  }

  async loadEmbeddings(
    embeddingsFilePath: string,
    embeddingDim: number,
  ): Promise<Float32Array> {
    // Read binary file as base64, decode to Float32Array
    const base64 = await RNFS.readFile(embeddingsFilePath, 'base64');
    const binary = Buffer.from(base64, 'base64');
    return new Float32Array(binary.buffer, binary.byteOffset, binary.byteLength / 4);
  }

  getEmbeddingsForIndividual(
    allEmbeddings: Float32Array,
    individual: PackIndividual,
    embeddingDim: number,
  ): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < individual.embeddingCount; i++) {
      const start = (individual.embeddingOffset + i) * embeddingDim;
      const vec = Array.from(allEmbeddings.slice(start, start + embeddingDim));
      result.push(vec);
    }
    return result;
  }

  async deletePack(packDir: string): Promise<void> {
    const exists = await RNFS.exists(packDir);
    if (exists) {
      await RNFS.unlink(packDir);
      logger.log(`[PackManager] Deleted pack: ${packDir}`);
    }
  }

  getPacksDir(): string {
    return PACKS_DIR;
  }
}

export const packManager = new PackManager();
```

**Step 4: Add to service barrel export**

Add to `src/services/index.ts`:

```typescript
export { packManager } from './packManager';
```

**Step 5: Run tests**

Run: `npx jest __tests__/unit/services/packManager.test.ts --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/services/packManager/ __tests__/unit/services/packManager.test.ts src/services/index.ts
git commit -m "feat: add embedding pack manager service"
```

---

## Phase 2: State Management (Zustand Stores)

### Task 2.1: Create wildlife store

**Files:**
- Create: `src/stores/wildlifeStore.ts`
- Modify: `src/stores/index.ts`
- Test: `__tests__/unit/stores/wildlifeStore.test.ts`

**Step 1: Write failing tests**

Create `__tests__/unit/stores/wildlifeStore.test.ts`:

```typescript
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { useWildlifeStore } from '../../../src/stores/wildlifeStore';

describe('wildlifeStore', () => {
  beforeEach(() => {
    useWildlifeStore.getState().reset();
  });

  describe('embedding packs', () => {
    it('should start with empty packs array', () => {
      expect(useWildlifeStore.getState().packs).toEqual([]);
    });

    it('should add a pack', () => {
      const pack = {
        id: 'test-pack',
        species: 'horse',
        featureClass: 'horse+face',
        displayName: 'Test Horses',
        wildbookInstanceUrl: 'https://test.wildbook.org',
        exportDate: '2026-03-01T00:00:00Z',
        individualCount: 10,
        embeddingDim: 2152,
        embeddingModelVersion: '4.0.0',
        detectorModelFile: '/path/to/detector.onnx',
        embeddingsFile: '/path/to/embeddings.bin',
        indexFile: '/path/to/index.json',
        referencePhotosDir: '/path/to/photos',
        packDir: '/path/to/pack',
        downloadedAt: '2026-03-01T00:00:00Z',
        sizeBytes: 35000000,
      };

      useWildlifeStore.getState().addPack(pack);
      expect(useWildlifeStore.getState().packs).toHaveLength(1);
      expect(useWildlifeStore.getState().packs[0].id).toBe('test-pack');
    });

    it('should remove a pack by id', () => {
      const pack = {
        id: 'test-pack',
        species: 'horse',
        featureClass: 'horse+face',
        displayName: 'Test Horses',
        wildbookInstanceUrl: 'https://test.wildbook.org',
        exportDate: '2026-03-01T00:00:00Z',
        individualCount: 10,
        embeddingDim: 2152,
        embeddingModelVersion: '4.0.0',
        detectorModelFile: '/path/to/detector.onnx',
        embeddingsFile: '/path/to/embeddings.bin',
        indexFile: '/path/to/index.json',
        referencePhotosDir: '/path/to/photos',
        packDir: '/path/to/pack',
        downloadedAt: '2026-03-01T00:00:00Z',
        sizeBytes: 35000000,
      };

      useWildlifeStore.getState().addPack(pack);
      useWildlifeStore.getState().removePack('test-pack');
      expect(useWildlifeStore.getState().packs).toEqual([]);
    });
  });

  describe('observations', () => {
    it('should start with empty observations', () => {
      expect(useWildlifeStore.getState().observations).toEqual([]);
    });

    it('should add an observation', () => {
      const obs = {
        id: 'obs-1',
        photoUri: 'file:///photo.jpg',
        gps: { lat: 34.05, lon: -118.24, accuracy: 5 },
        timestamp: '2026-03-20T14:30:00Z',
        deviceInfo: { model: 'iPhone 15', os: 'iOS 18' },
        fieldNotes: null,
        detections: [],
        createdAt: '2026-03-20T14:30:00Z',
      };

      useWildlifeStore.getState().addObservation(obs);
      expect(useWildlifeStore.getState().observations).toHaveLength(1);
    });
  });

  describe('local individuals', () => {
    it('should start with empty local individuals', () => {
      expect(useWildlifeStore.getState().localIndividuals).toEqual([]);
    });

    it('should add a local individual', () => {
      const individual = {
        localId: 'FIELD-001',
        userLabel: 'Bay mare',
        species: 'horse',
        embeddings: [[1, 2, 3]],
        referencePhotos: ['file:///crop.jpg'],
        firstSeen: '2026-03-20T14:30:00Z',
        encounterCount: 1,
        syncStatus: 'pending' as const,
        wildbookId: null,
      };

      useWildlifeStore.getState().addLocalIndividual(individual);
      expect(useWildlifeStore.getState().localIndividuals).toHaveLength(1);
      expect(useWildlifeStore.getState().localIndividuals[0].localId).toBe('FIELD-001');
    });

    it('should add embedding to existing local individual', () => {
      const individual = {
        localId: 'FIELD-001',
        userLabel: null,
        species: 'horse',
        embeddings: [[1, 2, 3]],
        referencePhotos: ['file:///crop1.jpg'],
        firstSeen: '2026-03-20T14:30:00Z',
        encounterCount: 1,
        syncStatus: 'pending' as const,
        wildbookId: null,
      };

      useWildlifeStore.getState().addLocalIndividual(individual);
      useWildlifeStore.getState().addEmbeddingToLocalIndividual('FIELD-001', [4, 5, 6], 'file:///crop2.jpg');

      const updated = useWildlifeStore.getState().localIndividuals[0];
      expect(updated.embeddings).toHaveLength(2);
      expect(updated.referencePhotos).toHaveLength(2);
      expect(updated.encounterCount).toBe(2);
    });
  });

  describe('sync queue', () => {
    it('should start with empty sync queue', () => {
      expect(useWildlifeStore.getState().syncQueue).toEqual([]);
    });

    it('should add item to sync queue', () => {
      useWildlifeStore.getState().addToSyncQueue({
        observationId: 'obs-1',
        status: 'pending',
        wildbookInstanceUrl: 'https://test.wildbook.org',
        retryCount: 0,
        lastError: null,
        lastAttempt: null,
        syncedAt: null,
        wildbookEncounterIds: [],
      });

      expect(useWildlifeStore.getState().syncQueue).toHaveLength(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unit/stores/wildlifeStore.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Write the store**

Create `src/stores/wildlifeStore.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  EmbeddingPack,
  Observation,
  Detection,
  LocalIndividual,
  SyncQueueItem,
} from '../types';

interface WildlifeState {
  // State
  packs: EmbeddingPack[];
  observations: Observation[];
  localIndividuals: LocalIndividual[];
  syncQueue: SyncQueueItem[];
  miewidModelPath: string | null;
  nextFieldId: number;

  // Pack actions
  addPack: (pack: EmbeddingPack) => void;
  removePack: (packId: string) => void;

  // Observation actions
  addObservation: (observation: Observation) => void;
  updateDetection: (observationId: string, detectionId: string, updates: Partial<Detection>) => void;

  // Local individual actions
  addLocalIndividual: (individual: LocalIndividual) => void;
  addEmbeddingToLocalIndividual: (localId: string, embedding: number[], refPhotoUri: string) => void;
  getNextFieldId: () => string;

  // Sync queue actions
  addToSyncQueue: (item: SyncQueueItem) => void;
  updateSyncStatus: (observationId: string, updates: Partial<SyncQueueItem>) => void;

  // MiewID model
  setMiewidModelPath: (path: string | null) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  packs: [] as EmbeddingPack[],
  observations: [] as Observation[],
  localIndividuals: [] as LocalIndividual[],
  syncQueue: [] as SyncQueueItem[],
  miewidModelPath: null as string | null,
  nextFieldId: 1,
};

export const useWildlifeStore = create<WildlifeState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Pack actions
      addPack: (pack) =>
        set((state) => ({ packs: [...state.packs, pack] })),

      removePack: (packId) =>
        set((state) => ({
          packs: state.packs.filter((p) => p.id !== packId),
        })),

      // Observation actions
      addObservation: (observation) =>
        set((state) => ({
          observations: [...state.observations, observation],
        })),

      updateDetection: (observationId, detectionId, updates) =>
        set((state) => ({
          observations: state.observations.map((obs) => {
            if (obs.id !== observationId) return obs;
            return {
              ...obs,
              detections: obs.detections.map((det) => {
                if (det.id !== detectionId) return det;
                return { ...det, ...updates };
              }),
            };
          }),
        })),

      // Local individual actions
      addLocalIndividual: (individual) =>
        set((state) => ({
          localIndividuals: [...state.localIndividuals, individual],
        })),

      addEmbeddingToLocalIndividual: (localId, embedding, refPhotoUri) =>
        set((state) => ({
          localIndividuals: state.localIndividuals.map((ind) => {
            if (ind.localId !== localId) return ind;
            return {
              ...ind,
              embeddings: [...ind.embeddings, embedding],
              referencePhotos: [...ind.referencePhotos, refPhotoUri],
              encounterCount: ind.encounterCount + 1,
            };
          }),
        })),

      getNextFieldId: () => {
        const id = get().nextFieldId;
        set({ nextFieldId: id + 1 });
        return `FIELD-${String(id).padStart(3, '0')}`;
      },

      // Sync queue actions
      addToSyncQueue: (item) =>
        set((state) => ({ syncQueue: [...state.syncQueue, item] })),

      updateSyncStatus: (observationId, updates) =>
        set((state) => ({
          syncQueue: state.syncQueue.map((item) => {
            if (item.observationId !== observationId) return item;
            return { ...item, ...updates };
          }),
        })),

      // MiewID model
      setMiewidModelPath: (path) => set({ miewidModelPath: path }),

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'wildlife-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        packs: state.packs,
        observations: state.observations,
        localIndividuals: state.localIndividuals,
        syncQueue: state.syncQueue,
        miewidModelPath: state.miewidModelPath,
        nextFieldId: state.nextFieldId,
      }),
    },
  ),
);
```

**Step 4: Add to store barrel export**

Add to `src/stores/index.ts`:

```typescript
export { useWildlifeStore } from './wildlifeStore';
```

**Step 5: Run tests**

Run: `npx jest __tests__/unit/stores/wildlifeStore.test.ts --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/stores/wildlifeStore.ts src/stores/index.ts __tests__/unit/stores/wildlifeStore.test.ts
git commit -m "feat: add wildlife Zustand store for packs, observations, and local individuals"
```

---

## Phase 3: Detection & Re-ID Pipeline Orchestration

### Task 3.1: Create wildlife pipeline service

**Files:**
- Create: `src/services/wildlifePipeline/index.ts`
- Create: `src/services/wildlifePipeline/types.ts`
- Test: `__tests__/unit/services/wildlifePipeline.test.ts`

This service orchestrates the full pipeline: detect → crop → embed → match → save.

**Step 1: Write failing tests**

Create `__tests__/unit/services/wildlifePipeline.test.ts`:

```typescript
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn(),
  copyFile: jest.fn(),
}));

jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn() },
  Tensor: jest.fn(),
}));

jest.mock('../../../src/services/onnxInferenceService', () => ({
  onnxInferenceService: {
    loadModel: jest.fn().mockResolvedValue(undefined),
    runDetection: jest.fn().mockResolvedValue({
      results: [
        { boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 }, species: 'horse_face', confidence: 0.95 },
      ],
      inferenceTimeMs: 150,
    }),
    extractEmbedding: jest.fn().mockResolvedValue({
      embedding: new Array(2152).fill(0.1),
      inferenceTimeMs: 200,
    }),
    isModelLoaded: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('../../../src/services/embeddingMatchService', () => ({
  embeddingMatchService: {
    matchEmbedding: jest.fn().mockReturnValue([
      { individualId: 'WB-HORSE-001', score: 0.85, source: 'pack', refPhotoIndex: 0 },
    ]),
  },
}));

import { wildlifePipeline } from '../../../src/services/wildlifePipeline';

describe('WildlifePipeline', () => {
  it('should export a singleton instance', () => {
    expect(wildlifePipeline).toBeDefined();
    expect(typeof wildlifePipeline.processPhoto).toBe('function');
  });

  it('processPhoto should return detections with match results', async () => {
    const result = await wildlifePipeline.processPhoto(
      'file:///photo.jpg',
      {
        lat: 34.05,
        lon: -118.24,
        accuracy: 5,
      },
      [
        {
          packId: 'test-pack',
          species: 'horse',
          detectorModelPath: '/path/to/detector.onnx',
          detectorConfig: {
            modelFile: 'detector.onnx',
            architecture: 'yolo11',
            inputSize: [640, 640],
            inputChannels: 3,
            channelOrder: 'RGB' as const,
            normalize: { mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
            confidenceThreshold: 0.5,
            nmsThreshold: 0.45,
            maxDetections: 20,
            outputFormat: 'yolo',
            classLabels: ['horse_face'],
            outputSpec: {
              boxFormat: 'xyxy' as const,
              coordinateType: 'normalized' as const,
              layout: 'batch_detections_attributes',
            },
          },
          embeddingDatabase: [],
        },
      ],
      '/path/to/miewid.onnx',
    );

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].species).toBe('horse_face');
    expect(result.detections[0].embedding).toHaveLength(2152);
    expect(result.detections[0].matchResult.topCandidates).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unit/services/wildlifePipeline.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Write the service**

Create `src/services/wildlifePipeline/types.ts`:

```typescript
import type { DetectorConfig, Detection } from '../../types';
import type { EmbeddingDatabaseEntry } from '../embeddingMatchService/types';

export interface SpeciesConfig {
  packId: string;
  species: string;
  detectorModelPath: string;
  detectorConfig: DetectorConfig;
  embeddingDatabase: EmbeddingDatabaseEntry[];
}

export interface PipelineResult {
  observationId: string;
  photoUri: string;
  detections: Detection[];
  totalInferenceTimeMs: number;
}
```

Create `src/services/wildlifePipeline/index.ts`:

```typescript
import { onnxInferenceService } from '../onnxInferenceService';
import { embeddingMatchService } from '../embeddingMatchService';
import type { Detection } from '../../types';
import type { SpeciesConfig, PipelineResult } from './types';
import { generateId } from '../../utils/generateId';
import logger from '../../utils/logger';

const TOP_N_CANDIDATES = 5;

class WildlifePipeline {
  async processPhoto(
    photoUri: string,
    gps: { lat: number; lon: number; accuracy: number } | null,
    speciesConfigs: SpeciesConfig[],
    miewidModelPath: string,
  ): Promise<PipelineResult> {
    const observationId = generateId();
    const allDetections: Detection[] = [];
    let totalInferenceTimeMs = 0;

    // Run each species detector against the photo
    for (const config of speciesConfigs) {
      // Ensure detector is loaded
      if (!onnxInferenceService.isModelLoaded(config.detectorModelPath)) {
        await onnxInferenceService.loadModel(config.detectorModelPath, 'detector');
      }

      // Run detection
      const detectionOutput = await onnxInferenceService.runDetection(
        photoUri,
        config.detectorModelPath,
        config.detectorConfig,
      );
      totalInferenceTimeMs += detectionOutput.inferenceTimeMs;

      // Ensure MiewID is loaded
      if (!onnxInferenceService.isModelLoaded(miewidModelPath)) {
        await onnxInferenceService.loadModel(miewidModelPath, 'embedding');
      }

      // Process each detection
      for (const result of detectionOutput.results) {
        const detectionId = generateId();

        // TODO: Crop bounding box from photo and save to filesystem
        const croppedImageUri = `file:///crops/${detectionId}.jpg`;

        // Extract embedding from cropped image
        const embeddingOutput = await onnxInferenceService.extractEmbedding(
          croppedImageUri,
          miewidModelPath,
        );
        totalInferenceTimeMs += embeddingOutput.inferenceTimeMs;

        // Match against database
        const candidates = embeddingMatchService.matchEmbedding(
          embeddingOutput.embedding,
          config.embeddingDatabase,
          TOP_N_CANDIDATES,
        );

        const detection: Detection = {
          id: detectionId,
          observationId,
          boundingBox: result.boundingBox,
          species: result.species,
          speciesConfidence: result.confidence,
          croppedImageUri,
          embedding: embeddingOutput.embedding,
          matchResult: {
            topCandidates: candidates,
            approvedIndividual: null,
            reviewStatus: 'pending',
          },
          encounterFields: {
            locationId: null,
            sex: null,
            lifeStage: null,
            behavior: null,
            submitterId: null,
            projectId: null,
          },
        };

        allDetections.push(detection);
      }
    }

    logger.log(
      `[WildlifePipeline] Processed photo: ${allDetections.length} detections in ${totalInferenceTimeMs}ms`,
    );

    return {
      observationId,
      photoUri,
      detections: allDetections,
      totalInferenceTimeMs,
    };
  }
}

export const wildlifePipeline = new WildlifePipeline();
```

**Step 4: Add to service barrel export**

Add to `src/services/index.ts`:

```typescript
export { wildlifePipeline } from './wildlifePipeline';
```

**Step 5: Run tests**

Run: `npx jest __tests__/unit/services/wildlifePipeline.test.ts --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/services/wildlifePipeline/ __tests__/unit/services/wildlifePipeline.test.ts src/services/index.ts
git commit -m "feat: add wildlife pipeline service orchestrating detect → embed → match"
```

---

## Phase 4: Navigation & Screen Scaffolding

### Task 4.1: Create navigation structure for wildlife app

**Files:**
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/AppNavigator.tsx`

**Step 1: Update navigation types**

Replace the existing navigation types with wildlife-specific ones:

```typescript
import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  PackDetails: { packId: string };
  Capture: undefined;
  DetectionResults: { observationId: string };
  MatchReview: { observationId: string; detectionId: string };
  ObservationDetail: { observationId: string };
  Settings: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  PacksTab: undefined;
  ObservationsTab: undefined;
  SyncTab: undefined;
};
```

**Step 2: Create placeholder screens**

Create minimal placeholder screens for each route so navigation compiles. Each screen is a simple `SafeAreaView` with the screen name displayed.

Create `src/screens/WildlifeHomeScreen.tsx`, `src/screens/PacksScreen.tsx`, `src/screens/CaptureScreen.tsx`, `src/screens/DetectionResultsScreen.tsx`, `src/screens/MatchReviewScreen.tsx`, `src/screens/ObservationsScreen.tsx`, `src/screens/ObservationDetailScreen.tsx`, `src/screens/SyncScreen.tsx` as minimal placeholders.

Example placeholder:

```typescript
import React from 'react';
import { SafeAreaView, Text } from 'react-native';
import { useTheme } from '../theme';

export const PacksScreen: React.FC = () => {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }} testID="packs-screen">
      <Text style={{ color: colors.text }}>Packs Screen</Text>
    </SafeAreaView>
  );
};
```

**Step 3: Update AppNavigator to use new screens**

Wire the tab navigator and stack navigator with the new screens.

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/navigation/ src/screens/
git commit -m "feat: add wildlife navigation structure with placeholder screens"
```

---

### Task 4.2: Implement Packs Screen

**Files:**
- Modify: `src/screens/PacksScreen.tsx` (replace placeholder)
- Test: `__tests__/rntl/screens/PacksScreen.test.tsx`

This screen lists downloaded embedding packs with species name, individual count, export date, and storage size. Tapping a pack shows details. Reuse Off Grid's `Card` and `AnimatedListItem` components.

**Step 1: Write failing test**

**Step 2: Implement the screen**

**Step 3: Run test**

**Step 4: Commit**

(Detailed implementation code follows Off Grid's screen patterns from the exploration above — `useThemedStyles`, `Card` components, `FlatList` with `AnimatedListItem`, themed `createStyles` function.)

---

### Task 4.3: Implement Capture Screen

**Files:**
- Create: `src/screens/CaptureScreen/index.tsx`
- Create: `src/screens/CaptureScreen/useCaptureFlow.ts`
- Create: `src/screens/CaptureScreen/styles.ts`
- Test: `__tests__/rntl/screens/CaptureScreen.test.tsx`

This screen opens the camera (via react-native-image-picker), captures a photo, runs the detection pipeline, and navigates to DetectionResultsScreen.

---

### Task 4.4: Implement Detection Results Screen

**Files:**
- Create: `src/screens/DetectionResultsScreen/index.tsx`
- Create: `src/screens/DetectionResultsScreen/BoundingBoxOverlay.tsx`
- Create: `src/screens/DetectionResultsScreen/styles.ts`
- Test: `__tests__/rntl/screens/DetectionResultsScreen.test.tsx`

Shows the captured photo with bounding boxes drawn. Each box is tappable → navigates to MatchReviewScreen. "Save All" button saves without reviewing.

---

### Task 4.5: Implement Match Review Screen

**Files:**
- Create: `src/screens/MatchReviewScreen/index.tsx`
- Create: `src/screens/MatchReviewScreen/CandidateCard.tsx`
- Create: `src/screens/MatchReviewScreen/styles.ts`
- Test: `__tests__/rntl/screens/MatchReviewScreen.test.tsx`

Side-by-side comparison: cropped detection on top, scrollable list of top-5 candidates below. Each candidate shows reference photo, name, ID, score, source badge (pack/local). Actions: "Approve" (one candidate), "No Match — New Individual", "Skip".

---

### Task 4.6: Implement Observations Screen

**Files:**
- Create: `src/screens/ObservationsScreen/index.tsx`
- Create: `src/screens/ObservationsScreen/styles.ts`
- Test: `__tests__/rntl/screens/ObservationsScreen.test.tsx`

Lists all saved observations with thumbnail, timestamp, detection count, review status. Filterable by: all, pending review, reviewed, synced.

---

### Task 4.7: Implement Wildlife Home Screen

**Files:**
- Modify: `src/screens/WildlifeHomeScreen.tsx` (replace placeholder)
- Test: `__tests__/rntl/screens/WildlifeHomeScreen.test.tsx`

Dashboard showing: active packs summary, quick capture button, recent observations, sync status indicator.

---

### Task 4.8: Implement Sync Screen (stub)

**Files:**
- Modify: `src/screens/SyncScreen.tsx` (replace placeholder)
- Test: `__tests__/rntl/screens/SyncScreen.test.tsx`

For MVP: shows sync queue with status indicators (pending/synced/failed). Manual sync button (non-functional for PoC — displays "Sync not yet implemented"). Retry button for failed items.

---

## Phase 5: Integration & End-to-End Pipeline

### Task 5.1: Wire capture flow to pipeline

Connect CaptureScreen → wildlifePipeline.processPhoto → save to wildlifeStore → navigate to DetectionResultsScreen.

### Task 5.2: Wire match review to store updates

Connect MatchReviewScreen approve/reject/new-individual actions to wildlifeStore.updateDetection and wildlifeStore.addLocalIndividual.

### Task 5.3: Wire new individual creation with embedding accumulation

When user creates a new LocalIndividual, add their detection's embedding. When a re-sighting is approved for a local individual, call addEmbeddingToLocalIndividual.

### Task 5.4: Build pack + local individual merged database for matching

Before running the pipeline, combine pack embeddings and local individual embeddings into a single EmbeddingDatabaseEntry[] for the match service.

### Task 5.5: App initialization

Update App.tsx to initialize packManager, load persisted packs, and hydrate the wildlife store on startup.

---

## Phase 6: Testing & Polish

### Task 6.1: Integration test — full pipeline

Write an integration test that mocks ONNX Runtime and verifies the full flow: photo → detect → embed → match → save observation → review → approve → local individual accumulation.

### Task 6.2: Integration test — pack loading

Test that pack manifest parsing, index loading, and binary embedding loading work correctly together.

### Task 6.3: E2E Maestro flow — capture and review

Write a Maestro E2E flow that captures a photo, views detection results, reviews a match, and saves.

### Task 6.4: Strip unused Off Grid modules

Remove LLM, image generation, voice, and tool-calling code. Update imports, tests, and navigation. Verify all remaining tests pass.

---

## Execution Notes

- **Each task is independent within its phase.** Tasks within a phase can be parallelized if they don't share files.
- **Phase dependencies:** Phase 1 must complete before Phase 3. Phase 0 must complete before Phase 1. Phase 2 can run in parallel with Phase 1. Phase 4 depends on Phase 2 for store access. Phase 5 depends on Phases 1-4.
- **Testing first:** Every task starts with a failing test (TDD). Run tests after each implementation step.
- **Commits are frequent:** One commit per task minimum, more if the task has distinct sub-steps.
- **The preprocessing TODO:** Tasks 1.2 and 1.3 have stub image preprocessing. Actual pixel extraction from images requires either `react-native-image-manipulator`, a custom native module, or a Canvas-based approach. This will need a spike task to determine the best approach for ONNX tensor creation from image URIs.
