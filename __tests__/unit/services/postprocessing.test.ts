import { parseYoloOutput } from '../../../src/services/onnxInferenceService/postprocessing';
import type { DetectorConfig } from '../../../src/types';

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

interface RawDetection {
  cx: number;
  cy: number;
  w: number;
  h: number;
  conf: number;
}

/**
 * Build a [1, 5, N] row-major output tensor for a single-class detector:
 * N cx values, N cy values, N w values, N h values, N confidences.
 */
const makeSingleClassOutput = (detections: RawDetection[]): Float32Array => {
  const n = detections.length;
  const data = new Float32Array(5 * n);
  detections.forEach((d, i) => {
    data[0 * n + i] = d.cx;
    data[1 * n + i] = d.cy;
    data[2 * n + i] = d.w;
    data[3 * n + i] = d.h;
    data[4 * n + i] = d.conf;
  });
  return data;
};

const ORIGINAL_SIZE = { width: 4032, height: 3024 };

describe('parseYoloOutput', () => {
  describe('coordinate conversion', () => {
    it('normalizes absolute cxcywh boxes by the model input size', () => {
      const output = makeSingleClassOutput([
        { cx: 320, cy: 320, w: 100, h: 100, conf: 0.9 },
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results).toHaveLength(1);
      const box = results[0].boundingBox;
      expect(box.x).toBeCloseTo((320 - 50) / 640, 6);
      expect(box.y).toBeCloseTo((320 - 50) / 640, 6);
      expect(box.width).toBeCloseTo(100 / 640, 6);
      expect(box.height).toBeCloseTo(100 / 640, 6);
    });

    it('passes normalized coordinates through without rescaling', () => {
      const output = makeSingleClassOutput([
        { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, conf: 0.9 },
      ]);
      const config = makeDetectorConfig({
        outputSpec: {
          boxFormat: 'cxcywh',
          coordinateType: 'normalized',
          layout: '1x5xN',
        },
      });

      const results = parseYoloOutput(output, config, ORIGINAL_SIZE);

      expect(results).toHaveLength(1);
      const box = results[0].boundingBox;
      expect(box.x).toBeCloseTo(0.4, 6);
      expect(box.y).toBeCloseTo(0.4, 6);
      expect(box.width).toBeCloseTo(0.2, 6);
      expect(box.height).toBeCloseTo(0.2, 6);
    });
  });

  describe('clamping to the unit square', () => {
    it('clamps a box overhanging the left edge and trims its width', () => {
      // cx=10, w=40 → raw x = -10/640, right edge at 30/640
      const output = makeSingleClassOutput([
        { cx: 10, cy: 320, w: 40, h: 100, conf: 0.9 },
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results).toHaveLength(1);
      const box = results[0].boundingBox;
      expect(box.x).toBe(0);
      expect(box.width).toBeCloseTo(30 / 640, 6);
      expect(box.y).toBeCloseTo((320 - 50) / 640, 6);
      expect(box.height).toBeCloseTo(100 / 640, 6);
    });

    it('clamps a box overhanging the bottom-right corner', () => {
      // right edge at 680 > 640, bottom edge at 660 > 640
      const output = makeSingleClassOutput([
        { cx: 630, cy: 620, w: 100, h: 80, conf: 0.9 },
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results).toHaveLength(1);
      const box = results[0].boundingBox;
      expect(box.x).toBeCloseTo(580 / 640, 6);
      expect(box.y).toBeCloseTo(580 / 640, 6);
      expect(box.x + box.width).toBeLessThanOrEqual(1);
      expect(box.y + box.height).toBeLessThanOrEqual(1);
      expect(box.width).toBeCloseTo(60 / 640, 6);
      expect(box.height).toBeCloseTo(60 / 640, 6);
    });

    it('always returns boxes fully inside [0, 1]', () => {
      const output = makeSingleClassOutput([
        { cx: 5, cy: 5, w: 200, h: 200, conf: 0.9 },
        { cx: 635, cy: 635, w: 200, h: 200, conf: 0.8 },
        { cx: 320, cy: 320, w: 100, h: 100, conf: 0.7 },
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results.length).toBeGreaterThan(0);
      for (const { boundingBox: box } of results) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1);
        expect(box.y + box.height).toBeLessThanOrEqual(1);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    });

    it('drops a box lying entirely outside the image', () => {
      const output = makeSingleClassOutput([
        { cx: -100, cy: 320, w: 50, h: 50, conf: 0.9 },
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results).toHaveLength(0);
    });

    it('drops a degenerate zero-area box', () => {
      const output = makeSingleClassOutput([
        { cx: 320, cy: 320, w: 0, h: 100, conf: 0.9 },
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results).toHaveLength(0);
    });
  });

  describe('filtering and suppression (regression cover)', () => {
    it('filters detections below the confidence threshold', () => {
      const output = makeSingleClassOutput([
        { cx: 320, cy: 320, w: 100, h: 100, conf: 0.4 },
        { cx: 100, cy: 100, w: 50, h: 50, conf: 0.9 },
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBeCloseTo(0.9, 6);
    });

    it('suppresses overlapping lower-confidence boxes via NMS', () => {
      const output = makeSingleClassOutput([
        { cx: 320, cy: 320, w: 100, h: 100, conf: 0.9 },
        { cx: 325, cy: 325, w: 100, h: 100, conf: 0.8 }, // heavy overlap
        { cx: 100, cy: 100, w: 50, h: 50, conf: 0.7 }, // disjoint
      ]);

      const results = parseYoloOutput(output, makeDetectorConfig(), ORIGINAL_SIZE);

      expect(results).toHaveLength(2);
      expect(results[0].confidence).toBeCloseTo(0.9, 6);
      expect(results[1].confidence).toBeCloseTo(0.7, 6);
    });

    it('caps results at maxDetections', () => {
      const output = makeSingleClassOutput([
        { cx: 100, cy: 100, w: 50, h: 50, conf: 0.9 },
        { cx: 300, cy: 300, w: 50, h: 50, conf: 0.8 },
        { cx: 500, cy: 500, w: 50, h: 50, conf: 0.7 },
      ]);
      const config = makeDetectorConfig({ maxDetections: 2 });

      const results = parseYoloOutput(output, config, ORIGINAL_SIZE);

      expect(results).toHaveLength(2);
    });

    it('returns an empty array for empty output data', () => {
      const results = parseYoloOutput(
        new Float32Array(0),
        makeDetectorConfig(),
        ORIGINAL_SIZE,
      );

      expect(results).toEqual([]);
    });
  });
});
