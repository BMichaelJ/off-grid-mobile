/**
 * Integration Test: Pack Loading
 *
 * Tests that pack manifest parsing, index loading, and binary embedding
 * loading work correctly together through the real PackManager methods.
 *
 * Only react-native-fs (the native boundary) is mocked.
 * The real packManager.loadManifest, loadPackIndex, and
 * getEmbeddingsForIndividual are exercised.
 */

import RNFS from 'react-native-fs';
import { packManager } from '../../../src/services/packManager';
import type {
  EmbeddingPackManifest,
  PackIndividual,
} from '../../../src/types';

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MANIFEST_PATH = '/mock/documents/embedding_packs/zebra-plains/manifest.json';
const INDEX_PATH = '/mock/documents/embedding_packs/zebra-plains/embeddings/index.json';

const VALID_MANIFEST: EmbeddingPackManifest = {
  formatVersion: '1.0',
  species: 'zebra_plains',
  featureClass: 'zebra+flank',
  displayName: 'Plains Zebra — Nairobi Region',
  description: 'Reference pack containing 150 identified plains zebras.',
  wildbookInstanceUrl: 'https://zebra.wildbook.org',
  exportDate: '2026-02-20T12:00:00Z',
  individualCount: 150,
  embeddingCount: 600,
  embeddingDim: 4,
  embeddingModel: {
    name: 'miewid-v4',
    version: '4.0.0',
    inputSize: [440, 440],
    normalize: {
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
    },
  },
  detectorModel: {
    filename: 'zebra-flank-yolo11n.onnx',
    configFile: 'config/detector.json',
  },
  checksums: {
    'embeddings.bin': 'sha256:abc123',
    'index.json': 'sha256:def456',
  },
};

function makeIndividual(overrides: Partial<PackIndividual> = {}): PackIndividual {
  return {
    id: 'WB-ZEB-001',
    name: 'Stripe',
    alternateId: 'ZEB-ALT-001',
    sex: 'female',
    lifeStage: 'adult',
    firstSeen: '2024-03-10',
    lastSeen: '2026-02-18',
    encounterCount: 12,
    embeddingCount: 2,
    embeddingOffset: 0,
    referencePhotos: ['ref_001.jpg', 'ref_002.jpg'],
    notes: null,
    ...overrides,
  };
}

const INDIVIDUAL_A = makeIndividual({
  id: 'WB-ZEB-001',
  name: 'Stripe',
  embeddingCount: 2,
  embeddingOffset: 0,
});

const INDIVIDUAL_B = makeIndividual({
  id: 'WB-ZEB-002',
  name: 'Dash',
  sex: 'male',
  embeddingCount: 3,
  embeddingOffset: 2,
});

function makeValidIndex(individuals: PackIndividual[]) {
  return {
    formatVersion: '1.0',
    generatedWith: 'miewid-v4',
    individuals,
  };
}

/**
 * Build a Float32Array of sequential values for predictable testing.
 * Each embedding vector of dimension `dim` contains sequential floats:
 *   vector 0: [0.0, 0.1, 0.2, 0.3]  (dim=4)
 *   vector 1: [0.4, 0.5, 0.6, 0.7]
 *   ...
 */
function buildEmbeddingsArray(totalVectors: number, dim: number): Float32Array {
  const arr = new Float32Array(totalVectors * dim);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = i * 0.1;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pack Loading — Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. loadManifest parses manifest correctly
  // -----------------------------------------------------------------------
  it('loadManifest parses manifest correctly', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify(VALID_MANIFEST),
    );

    const manifest = await packManager.loadManifest(MANIFEST_PATH);

    expect(RNFS.readFile).toHaveBeenCalledWith(MANIFEST_PATH, 'utf8');

    // Verify all top-level fields
    expect(manifest.formatVersion).toBe('1.0');
    expect(manifest.species).toBe('zebra_plains');
    expect(manifest.featureClass).toBe('zebra+flank');
    expect(manifest.displayName).toBe('Plains Zebra — Nairobi Region');
    expect(manifest.description).toBe(
      'Reference pack containing 150 identified plains zebras.',
    );
    expect(manifest.wildbookInstanceUrl).toBe('https://zebra.wildbook.org');
    expect(manifest.exportDate).toBe('2026-02-20T12:00:00Z');
    expect(manifest.individualCount).toBe(150);
    expect(manifest.embeddingCount).toBe(600);
    expect(manifest.embeddingDim).toBe(4);

    // Verify nested embeddingModel
    expect(manifest.embeddingModel.name).toBe('miewid-v4');
    expect(manifest.embeddingModel.version).toBe('4.0.0');
    expect(manifest.embeddingModel.inputSize).toEqual([440, 440]);
    expect(manifest.embeddingModel.normalize.mean).toEqual([0.485, 0.456, 0.406]);
    expect(manifest.embeddingModel.normalize.std).toEqual([0.229, 0.224, 0.225]);

    // Verify nested detectorModel
    expect(manifest.detectorModel.filename).toBe('zebra-flank-yolo11n.onnx');
    expect(manifest.detectorModel.configFile).toBe('config/detector.json');

    // Verify optional checksums
    expect(manifest.checksums).toEqual({
      'embeddings.bin': 'sha256:abc123',
      'index.json': 'sha256:def456',
    });
  });

  // -----------------------------------------------------------------------
  // 2. loadPackIndex returns individuals array
  // -----------------------------------------------------------------------
  it('loadPackIndex returns individuals array', async () => {
    const index = makeValidIndex([INDIVIDUAL_A, INDIVIDUAL_B]);
    (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(index));

    const individuals = await packManager.loadPackIndex(INDEX_PATH);

    expect(RNFS.readFile).toHaveBeenCalledWith(INDEX_PATH, 'utf8');
    expect(individuals).toHaveLength(2);

    // Verify first individual
    expect(individuals[0].id).toBe('WB-ZEB-001');
    expect(individuals[0].name).toBe('Stripe');
    expect(individuals[0].sex).toBe('female');
    expect(individuals[0].embeddingCount).toBe(2);
    expect(individuals[0].embeddingOffset).toBe(0);
    expect(individuals[0].referencePhotos).toEqual(['ref_001.jpg', 'ref_002.jpg']);

    // Verify second individual
    expect(individuals[1].id).toBe('WB-ZEB-002');
    expect(individuals[1].name).toBe('Dash');
    expect(individuals[1].sex).toBe('male');
    expect(individuals[1].embeddingCount).toBe(3);
    expect(individuals[1].embeddingOffset).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 3. getEmbeddingsForIndividual extracts correct vectors
  // -----------------------------------------------------------------------
  it('getEmbeddingsForIndividual extracts correct vectors (offset=0)', () => {
    const dim = 4;
    // 5 total vectors, dim=4 -> 20 floats
    const allEmbeddings = buildEmbeddingsArray(5, dim);

    const individual = makeIndividual({
      embeddingOffset: 0,
      embeddingCount: 2,
    });

    const result = packManager.getEmbeddingsForIndividual(
      allEmbeddings,
      individual,
      dim,
    );

    expect(result).toHaveLength(2);

    // Vector 0: indices 0..3 -> [0.0, 0.1, 0.2, 0.3]
    expect(result[0]).toHaveLength(dim);
    for (let i = 0; i < dim; i++) {
      expect(result[0][i]).toBeCloseTo(i * 0.1, 5);
    }

    // Vector 1: indices 4..7 -> [0.4, 0.5, 0.6, 0.7]
    expect(result[1]).toHaveLength(dim);
    for (let i = 0; i < dim; i++) {
      expect(result[1][i]).toBeCloseTo((dim + i) * 0.1, 5);
    }
  });

  // -----------------------------------------------------------------------
  // 4. getEmbeddingsForIndividual with non-zero offset
  // -----------------------------------------------------------------------
  it('getEmbeddingsForIndividual with non-zero offset', () => {
    const dim = 4;
    // 8 total vectors, dim=4 -> 32 floats
    const allEmbeddings = buildEmbeddingsArray(8, dim);

    const individual = makeIndividual({
      embeddingOffset: 3,
      embeddingCount: 2,
    });

    const result = packManager.getEmbeddingsForIndividual(
      allEmbeddings,
      individual,
      dim,
    );

    expect(result).toHaveLength(2);

    // Vector at offset 3: indices 12..15 -> [1.2, 1.3, 1.4, 1.5]
    const startIndex3 = 3 * dim; // 12
    for (let i = 0; i < dim; i++) {
      expect(result[0][i]).toBeCloseTo((startIndex3 + i) * 0.1, 5);
    }

    // Vector at offset 4: indices 16..19 -> [1.6, 1.7, 1.8, 1.9]
    const startIndex4 = 4 * dim; // 16
    for (let i = 0; i < dim; i++) {
      expect(result[1][i]).toBeCloseTo((startIndex4 + i) * 0.1, 5);
    }
  });

  // -----------------------------------------------------------------------
  // 5. Full flow: manifest -> index -> embeddings
  // -----------------------------------------------------------------------
  it('full flow: manifest -> index -> embeddings chain together', async () => {
    // Step 1: Load manifest to get embeddingDim
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      JSON.stringify(VALID_MANIFEST),
    );
    const manifest = await packManager.loadManifest(MANIFEST_PATH);
    const { embeddingDim } = manifest;
    expect(embeddingDim).toBe(4);

    // Step 2: Load index to get individuals
    const index = makeValidIndex([INDIVIDUAL_A, INDIVIDUAL_B]);
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      JSON.stringify(index),
    );
    const individuals = await packManager.loadPackIndex(INDEX_PATH);
    expect(individuals).toHaveLength(2);

    // Step 3: Simulate loading embeddings.bin as Float32Array
    // INDIVIDUAL_A: offset=0, count=2
    // INDIVIDUAL_B: offset=2, count=3
    // Total vectors needed: 2 + 3 = 5
    const totalVectors = 5;
    const allEmbeddings = buildEmbeddingsArray(totalVectors, embeddingDim);

    // Step 4: Extract embeddings for each individual
    const embeddingsA = packManager.getEmbeddingsForIndividual(
      allEmbeddings,
      individuals[0],
      embeddingDim,
    );
    const embeddingsB = packManager.getEmbeddingsForIndividual(
      allEmbeddings,
      individuals[1],
      embeddingDim,
    );

    // Verify individual A got 2 vectors starting at offset 0
    expect(embeddingsA).toHaveLength(2);
    expect(embeddingsA[0]).toHaveLength(embeddingDim);
    expect(embeddingsA[1]).toHaveLength(embeddingDim);

    // Verify individual B got 3 vectors starting at offset 2
    expect(embeddingsB).toHaveLength(3);
    expect(embeddingsB[0]).toHaveLength(embeddingDim);
    expect(embeddingsB[1]).toHaveLength(embeddingDim);
    expect(embeddingsB[2]).toHaveLength(embeddingDim);

    // Verify vectors do not overlap: A's last vector != B's first vector
    expect(embeddingsA[1]).not.toEqual(embeddingsB[0]);

    // Verify B's first vector starts right after A's last
    // A vector 1 starts at index 4 (offset=1, dim=4), B vector 0 starts at index 8 (offset=2, dim=4)
    for (let i = 0; i < embeddingDim; i++) {
      expect(embeddingsB[0][i]).toBeCloseTo((2 * embeddingDim + i) * 0.1, 5);
    }

    // Verify total coverage: all 5 vectors were correctly distributed
    expect(embeddingsA.length + embeddingsB.length).toBe(totalVectors);
  });

  // -----------------------------------------------------------------------
  // 6. Empty index returns empty array
  // -----------------------------------------------------------------------
  it('empty index returns empty array', async () => {
    const emptyIndex = makeValidIndex([]);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify(emptyIndex),
    );

    const individuals = await packManager.loadPackIndex(INDEX_PATH);

    expect(individuals).toEqual([]);
    expect(individuals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 7. Individual with zero embeddings returns empty array
  // -----------------------------------------------------------------------
  it('individual with zero embeddings returns empty array', () => {
    const dim = 4;
    const allEmbeddings = buildEmbeddingsArray(5, dim);

    const individual = makeIndividual({
      embeddingCount: 0,
      embeddingOffset: 2,
    });

    const result = packManager.getEmbeddingsForIndividual(
      allEmbeddings,
      individual,
      dim,
    );

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
});
