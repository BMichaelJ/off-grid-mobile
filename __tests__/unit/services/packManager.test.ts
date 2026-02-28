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
    expect(typeof packManager.loadPackIndex).toBe('function');
    expect(typeof packManager.loadManifest).toBe('function');
    expect(typeof packManager.getEmbeddingsForIndividual).toBe('function');
    expect(typeof packManager.deletePack).toBe('function');
    expect(typeof packManager.getPacksDir).toBe('function');
  });

  describe('initialize', () => {
    it('should create packs directory if it does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);

      await packManager.initialize();

      expect(RNFS.exists).toHaveBeenCalledWith('/mock/documents/embedding_packs');
      expect(RNFS.mkdir).toHaveBeenCalledWith('/mock/documents/embedding_packs');
    });

    it('should not create directory if it already exists', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      await packManager.initialize();

      expect(RNFS.mkdir).not.toHaveBeenCalled();
    });
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
          {
            id: 'WB-HORSE-002',
            name: 'Thunder',
            alternateId: null,
            sex: 'male',
            lifeStage: 'adult',
            firstSeen: '2025-01-20',
            lastSeen: '2026-03-01',
            encounterCount: 8,
            embeddingCount: 3,
            embeddingOffset: 5,
            referencePhotos: ['ref_01.jpg'],
            notes: null,
          },
        ],
      };

      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockIndex));

      const individuals = await packManager.loadPackIndex('/mock/pack/embeddings/index.json');

      expect(individuals).toHaveLength(2);
      expect(individuals[0].id).toBe('WB-HORSE-001');
      expect(individuals[0].name).toBe('Butterscotch');
      expect(individuals[0].embeddingCount).toBe(5);
      expect(individuals[0].embeddingOffset).toBe(0);
      expect(individuals[1].id).toBe('WB-HORSE-002');
      expect(individuals[1].embeddingOffset).toBe(5);
    });
  });

  describe('loadManifest', () => {
    it('should parse manifest.json', async () => {
      const mockManifest = {
        formatVersion: '1.0',
        species: 'horse',
        featureClass: 'horse+face',
        displayName: 'Test Horses',
        wildbookInstanceUrl: 'https://horses.wildbook.org',
        exportDate: '2026-03-15T00:00:00Z',
        individualCount: 2,
        embeddingCount: 8,
        embeddingDim: 2152,
        embeddingModel: {
          name: 'miewid-v4',
          version: '4.0.0',
          inputSize: [440, 440],
          normalize: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
        },
        detectorModel: {
          filename: 'horse-face-yolo11n.onnx',
          configFile: 'config/detector.json',
        },
      };

      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockManifest));

      const manifest = await packManager.loadManifest('/mock/pack/manifest.json');

      expect(manifest.species).toBe('horse');
      expect(manifest.embeddingDim).toBe(2152);
      expect(manifest.detectorModel.filename).toBe('horse-face-yolo11n.onnx');
    });
  });

  describe('getEmbeddingsForIndividual', () => {
    it('should extract correct embedding vectors by offset and count', () => {
      // Simulate embeddings.bin with 3-dim embeddings for simplicity
      const embeddingDim = 3;
      // 8 total vectors: [0,1,2], [3,4,5], [6,7,8], [9,10,11], [12,13,14], [15,16,17], [18,19,20], [21,22,23]
      const allEmbeddings = new Float32Array([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
      ]);

      const individual = {
        id: 'WB-HORSE-002',
        name: 'Thunder',
        alternateId: null,
        sex: 'male' as const,
        lifeStage: 'adult',
        firstSeen: '2025-01-20',
        lastSeen: '2026-03-01',
        encounterCount: 8,
        embeddingCount: 3,
        embeddingOffset: 5, // starts at vector index 5
        referencePhotos: ['ref_01.jpg'],
        notes: null,
      };

      const result = packManager.getEmbeddingsForIndividual(allEmbeddings, individual, embeddingDim);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([15, 16, 17]); // offset 5 * dim 3 = byte 15
      expect(result[1]).toEqual([18, 19, 20]);
      expect(result[2]).toEqual([21, 22, 23]);
    });
  });

  describe('deletePack', () => {
    it('should delete pack directory if it exists', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);

      await packManager.deletePack('/mock/documents/embedding_packs/test-pack');

      expect(RNFS.unlink).toHaveBeenCalledWith('/mock/documents/embedding_packs/test-pack');
    });

    it('should be a no-op if pack directory does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      await packManager.deletePack('/mock/nonexistent');

      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('getPacksDir', () => {
    it('should return the packs directory path', () => {
      expect(packManager.getPacksDir()).toBe('/mock/documents/embedding_packs');
    });
  });
});
