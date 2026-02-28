import { onnxInferenceService } from '../../../src/services/onnxInferenceService';

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
