import { onnxInferenceService } from '../../../src/services/onnxInferenceService';
import {
  preprocessImageForDetection,
  preprocessImageForEmbedding,
} from '../../../src/services/onnxInferenceService/preprocessing';
import { parseYoloOutput } from '../../../src/services/onnxInferenceService/postprocessing';
import type { DetectorConfig } from '../../../src/types';

jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: {
    create: jest.fn(),
  },
  Tensor: jest.fn(),
}));

const makeDetectorConfig = (
  overrides: Partial<DetectorConfig> = {},
): DetectorConfig => ({
  modelFile: 'detector.onnx',
  architecture: 'yolov8',
  inputSize: [640, 640],
  inputChannels: 3,
  channelOrder: 'RGB',
  normalize: { mean: [0, 0, 0], std: [1, 1, 1], scale: 1.0 / 255 },
  confidenceThreshold: 0.5,
  nmsThreshold: 0.45,
  maxDetections: 100,
  outputFormat: 'yolov8',
  classLabels: ['zebra_plains'],
  outputSpec: {
    boxFormat: 'cxcywh',
    coordinateType: 'absolute',
    layout: '1x5xN',
  },
  ...overrides,
});

describe('OnnxInferenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await onnxInferenceService.unloadAll();
  });

  it('should export a singleton instance', () => {
    expect(onnxInferenceService).toBeDefined();
    expect(typeof onnxInferenceService.loadModel).toBe('function');
    expect(typeof onnxInferenceService.runDetection).toBe('function');
    expect(typeof onnxInferenceService.extractEmbedding).toBe('function');
    expect(typeof onnxInferenceService.unloadModel).toBe('function');
    expect(typeof onnxInferenceService.isModelLoaded).toBe('function');
  });

  describe('loadModel', () => {
    it('should create an InferenceSession and track it', async () => {
      const { InferenceSession } = require('onnxruntime-react-native');
      const mockSession = { release: jest.fn() };
      InferenceSession.create.mockResolvedValue(mockSession);

      await onnxInferenceService.loadModel('/path/to/model.onnx', 'detector');

      expect(InferenceSession.create).toHaveBeenCalledWith('/path/to/model.onnx');
      expect(onnxInferenceService.isModelLoaded('/path/to/model.onnx')).toBe(true);
    });

    it('should not reload an already loaded model', async () => {
      const { InferenceSession } = require('onnxruntime-react-native');
      const mockSession = { release: jest.fn() };
      InferenceSession.create.mockResolvedValue(mockSession);

      await onnxInferenceService.loadModel('/path/to/model.onnx', 'detector');
      await onnxInferenceService.loadModel('/path/to/model.onnx', 'detector');

      // Should only be called once (first load)
      expect(InferenceSession.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('unloadModel', () => {
    it('should release session and remove from tracking', async () => {
      const { InferenceSession } = require('onnxruntime-react-native');
      const mockSession = { release: jest.fn() };
      InferenceSession.create.mockResolvedValue(mockSession);

      await onnxInferenceService.loadModel('/path/to/model.onnx', 'detector');
      await onnxInferenceService.unloadModel('/path/to/model.onnx');

      expect(mockSession.release).toHaveBeenCalled();
      expect(onnxInferenceService.isModelLoaded('/path/to/model.onnx')).toBe(false);
    });

    it('should be a no-op for unloaded models', async () => {
      await expect(
        onnxInferenceService.unloadModel('/nonexistent.onnx'),
      ).resolves.not.toThrow();
    });
  });

  describe('isModelLoaded', () => {
    it('should return false for unloaded models', () => {
      expect(onnxInferenceService.isModelLoaded('/not/loaded.onnx')).toBe(false);
    });
  });

  describe('runDetection', () => {
    it('should return stub results', async () => {
      const result = await onnxInferenceService.runDetection(
        'file:///photo.jpg',
        '/path/to/detector.onnx',
        {} as any,
      );
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('inferenceTimeMs');
    });
  });

  describe('extractEmbedding', () => {
    it('should return stub results', async () => {
      const result = await onnxInferenceService.extractEmbedding(
        'file:///crop.jpg',
        '/path/to/miewid.onnx',
      );
      expect(result).toHaveProperty('embedding');
      expect(result).toHaveProperty('inferenceTimeMs');
    });
  });
});

describe('preprocessImageForDetection', () => {
  it('should return a Float32Array with correct dimensions for 640x640 config', async () => {
    const config = makeDetectorConfig({ inputSize: [640, 640], inputChannels: 3 });
    const result = await preprocessImageForDetection('file:///photo.jpg', config);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3 * 640 * 640);
  });

  it('should return a Float32Array with correct dimensions for non-square config', async () => {
    const config = makeDetectorConfig({ inputSize: [320, 480], inputChannels: 3 });
    const result = await preprocessImageForDetection('file:///photo.jpg', config);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3 * 320 * 480);
  });
});

describe('preprocessImageForEmbedding', () => {
  it('should return a Float32Array with correct dimensions (3*440*440)', async () => {
    const result = await preprocessImageForEmbedding('file:///crop.jpg');

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3 * 440 * 440);
  });
});

describe('parseYoloOutput', () => {
  it('should return empty array for empty output data', () => {
    const config = makeDetectorConfig();
    const emptyOutput = new Float32Array(0);
    const results = parseYoloOutput(emptyOutput, config, { width: 1920, height: 1080 });

    expect(results).toEqual([]);
  });

  it('should filter detections below confidence threshold', () => {
    const config = makeDetectorConfig({
      confidenceThreshold: 0.5,
      classLabels: ['zebra'],
      outputSpec: {
        boxFormat: 'cxcywh',
        coordinateType: 'absolute',
        layout: '1x5xN',
      },
    });
    // Layout 1x5xN: rows = [cx, cy, w, h, class0_conf], N=1 detection
    // 5 rows, 1 column => Float32Array of length 5
    // confidence 0.3 < threshold 0.5 => should be filtered
    const output = new Float32Array([
      320, // cx
      320, // cy
      100, // w
      100, // h
      0.3, // class0 confidence (below 0.5 threshold)
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    expect(results).toEqual([]);
  });

  it('should parse a valid detection with correct coordinates (cxcywh absolute)', () => {
    const config = makeDetectorConfig({
      inputSize: [640, 640],
      confidenceThreshold: 0.5,
      classLabels: ['zebra'],
      outputSpec: {
        boxFormat: 'cxcywh',
        coordinateType: 'absolute',
        layout: '1x5xN',
      },
    });
    // 1 detection, 5 rows (cx, cy, w, h, conf): values in input-pixel space
    const output = new Float32Array([
      320, // cx = 320/640 = 0.5
      320, // cy = 320/640 = 0.5
      200, // w  = 200/640 = 0.3125
      100, // h  = 100/640 = 0.15625
      0.9, // class0 confidence
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    expect(results).toHaveLength(1);
    const det = results[0];
    expect(det.species).toBe('zebra');
    expect(det.confidence).toBeCloseTo(0.9, 5);
    // BoundingBox should be normalized 0..1 relative to original image
    // cx=0.5, cy=0.5, w=0.3125, h=0.15625
    // x = cx - w/2 = 0.5 - 0.15625 = 0.34375
    // y = cy - h/2 = 0.5 - 0.078125 = 0.421875
    expect(det.boundingBox.x).toBeCloseTo(0.34375, 4);
    expect(det.boundingBox.y).toBeCloseTo(0.421875, 4);
    expect(det.boundingBox.width).toBeCloseTo(0.3125, 4);
    expect(det.boundingBox.height).toBeCloseTo(0.15625, 4);
  });

  it('should handle normalized coordinate type', () => {
    const config = makeDetectorConfig({
      inputSize: [640, 640],
      confidenceThreshold: 0.5,
      classLabels: ['zebra'],
      outputSpec: {
        boxFormat: 'cxcywh',
        coordinateType: 'normalized',
        layout: '1x5xN',
      },
    });
    // Already normalized values
    const output = new Float32Array([
      0.5,   // cx
      0.5,   // cy
      0.3,   // w
      0.2,   // h
      0.85,  // confidence
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    expect(results).toHaveLength(1);
    const det = results[0];
    expect(det.boundingBox.x).toBeCloseTo(0.35, 4);  // cx - w/2 = 0.5 - 0.15
    expect(det.boundingBox.y).toBeCloseTo(0.4, 4);   // cy - h/2 = 0.5 - 0.1
    expect(det.boundingBox.width).toBeCloseTo(0.3, 4);
    expect(det.boundingBox.height).toBeCloseTo(0.2, 4);
  });

  it('should apply NMS to suppress overlapping detections', () => {
    const config = makeDetectorConfig({
      inputSize: [640, 640],
      confidenceThreshold: 0.3,
      nmsThreshold: 0.5,
      classLabels: ['zebra'],
      outputSpec: {
        boxFormat: 'cxcywh',
        coordinateType: 'absolute',
        layout: '1x5xN',
      },
    });
    // 2 highly-overlapping detections; lower-confidence one should be suppressed
    // Layout: 5 rows, 2 columns => [row0_col0, row0_col1, row1_col0, row1_col1, ...]
    const output = new Float32Array([
      320, 322, // cx: nearly same position
      320, 321, // cy
      200, 200, // w
      100, 100, // h
      0.9, 0.7, // confidence
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    // NMS should keep only the higher-confidence detection
    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBeCloseTo(0.9, 5);
  });

  it('should respect maxDetections limit', () => {
    const config = makeDetectorConfig({
      inputSize: [640, 640],
      confidenceThreshold: 0.1,
      nmsThreshold: 0.01, // very low NMS so nothing gets suppressed
      maxDetections: 2,
      classLabels: ['zebra'],
      outputSpec: {
        boxFormat: 'cxcywh',
        coordinateType: 'absolute',
        layout: '1x5xN',
      },
    });
    // 4 non-overlapping detections
    const output = new Float32Array([
      100, 300, 500, 600, // cx
      100, 300, 500, 100, // cy
       50,  50,  50,  50, // w
       50,  50,  50,  50, // h
      0.9, 0.8, 0.7, 0.6, // confidence
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should handle multiple classes and pick the best', () => {
    const config = makeDetectorConfig({
      inputSize: [640, 640],
      confidenceThreshold: 0.3,
      classLabels: ['zebra', 'giraffe'],
      outputSpec: {
        boxFormat: 'cxcywh',
        coordinateType: 'absolute',
        layout: '1x6xN',
      },
    });
    // 6 rows (cx, cy, w, h, class0_conf, class1_conf), 1 detection
    const output = new Float32Array([
      320, // cx
      320, // cy
      200, // w
      100, // h
      0.3, // zebra confidence
      0.8, // giraffe confidence - higher
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    expect(results).toHaveLength(1);
    expect(results[0].species).toBe('giraffe');
    expect(results[0].confidence).toBeCloseTo(0.8, 5);
  });

  it('should handle xyxy box format', () => {
    const config = makeDetectorConfig({
      inputSize: [640, 640],
      confidenceThreshold: 0.5,
      classLabels: ['zebra'],
      outputSpec: {
        boxFormat: 'xyxy',
        coordinateType: 'absolute',
        layout: '1x5xN',
      },
    });
    // xyxy absolute: x1=100, y1=200, x2=300, y2=400
    const output = new Float32Array([
      100, // x1
      200, // y1
      300, // x2
      400, // y2
      0.9, // confidence
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    expect(results).toHaveLength(1);
    // Normalized: x=100/640, y=200/640, w=200/640, h=200/640
    expect(results[0].boundingBox.x).toBeCloseTo(100 / 640, 4);
    expect(results[0].boundingBox.y).toBeCloseTo(200 / 640, 4);
    expect(results[0].boundingBox.width).toBeCloseTo(200 / 640, 4);
    expect(results[0].boundingBox.height).toBeCloseTo(200 / 640, 4);
  });

  it('should handle xywh box format', () => {
    const config = makeDetectorConfig({
      inputSize: [640, 640],
      confidenceThreshold: 0.5,
      classLabels: ['zebra'],
      outputSpec: {
        boxFormat: 'xywh',
        coordinateType: 'absolute',
        layout: '1x5xN',
      },
    });
    // xywh absolute: x=100, y=200, w=200, h=200
    const output = new Float32Array([
      100, // x
      200, // y
      200, // w
      200, // h
      0.9, // confidence
    ]);
    const results = parseYoloOutput(output, config, { width: 1920, height: 1080 });

    expect(results).toHaveLength(1);
    expect(results[0].boundingBox.x).toBeCloseTo(100 / 640, 4);
    expect(results[0].boundingBox.y).toBeCloseTo(200 / 640, 4);
    expect(results[0].boundingBox.width).toBeCloseTo(200 / 640, 4);
    expect(results[0].boundingBox.height).toBeCloseTo(200 / 640, 4);
  });
});
