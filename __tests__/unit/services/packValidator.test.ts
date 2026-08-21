import { validatePack } from '../../../src/services/packManager/validator';

jest.mock('react-native-fs', () => ({
  exists: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
  hash: jest.fn(),
}));

import RNFS from 'react-native-fs';

const mockExists = RNFS.exists as jest.Mock;
const mockReadFile = RNFS.readFile as jest.Mock;
const mockStat = RNFS.stat as jest.Mock;
const mockHash = RNFS.hash as jest.Mock;

const PACK_DIR = '/mock/packs/horse';

interface MockFile {
  content?: string;
  size?: number;
  hash?: string;
}

/**
 * Drive the RNFS mocks from a single path → file fixture map.
 * Paths are absolute (`${PACK_DIR}/...`).
 */
const mockPackFs = (files: Record<string, MockFile>) => {
  mockExists.mockImplementation(async (path: string) => path in files);
  mockReadFile.mockImplementation(async (path: string) => {
    const file = files[path];
    if (!file || file.content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return file.content;
  });
  mockStat.mockImplementation(async (path: string) => {
    const file = files[path];
    if (!file) {
      throw new Error(`ENOENT: ${path}`);
    }
    return { size: file.size ?? file.content?.length ?? 0 };
  });
  mockHash.mockImplementation(async (path: string) => {
    const file = files[path];
    if (!file) {
      throw new Error(`ENOENT: ${path}`);
    }
    return file.hash ?? 'nohash';
  });
};

const makeManifest = (overrides: Record<string, unknown> = {}) => ({
  formatVersion: '1.0',
  species: 'horse',
  featureClass: 'horse_wild+face',
  displayName: 'Test Horses',
  wildbookInstanceUrl: 'https://horses.wildbook.org',
  exportDate: '2026-04-25T00:00:00Z',
  individualCount: 2,
  embeddingCount: 10,
  embeddingDim: 4,
  embeddingModel: {
    name: 'miewid-v4',
    version: '4.1.0',
    inputSize: [440, 440],
    normalize: {
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
    },
  },
  detectorModel: {
    filename: 'detector.onnx',
    configFile: 'config/detector.json',
  },
  checksums: {
    'embeddings.bin': 'sha256:binhash',
    'detector.onnx': 'sha256:dethash',
  },
  ...overrides,
});

const makeIndex = (individuals: unknown[]) =>
  JSON.stringify({
    formatVersion: '1.0',
    generatedWith: 'test',
    individuals,
  });

const INDIVIDUAL_A = {
  id: 'WB-001',
  name: 'Alpha',
  alternateId: null,
  sex: 'female',
  lifeStage: null,
  firstSeen: null,
  lastSeen: null,
  encounterCount: 6,
  embeddingCount: 6,
  embeddingOffset: 0,
  referencePhotos: [],
  notes: null,
};

const INDIVIDUAL_B = {
  ...INDIVIDUAL_A,
  id: 'WB-002',
  name: 'Beta',
  embeddingCount: 4,
  embeddingOffset: 6,
};

// embeddingCount 10 × embeddingDim 4 × 4 bytes = 160
const makeValidFiles = (): Record<string, MockFile> => ({
  [`${PACK_DIR}/manifest.json`]: { content: JSON.stringify(makeManifest()) },
  [`${PACK_DIR}/embeddings/embeddings.bin`]: { size: 160, hash: 'binhash' },
  [`${PACK_DIR}/embeddings/index.json`]: {
    content: makeIndex([INDIVIDUAL_A, INDIVIDUAL_B]),
  },
  [`${PACK_DIR}/models/detector.onnx`]: { size: 1000, hash: 'dethash' },
  [`${PACK_DIR}/config/detector.json`]: { content: '{}' },
});

const errorCodes = (result: { ok: boolean; errors?: { code: string }[] }) =>
  result.ok ? [] : result.errors!.map((e) => e.code);

describe('validatePack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a fully valid pack', async () => {
    mockPackFs(makeValidFiles());

    const result = await validatePack(PACK_DIR);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.species).toBe('horse');
      expect(result.individuals).toHaveLength(2);
    }
  });

  it('reports a missing manifest', async () => {
    const files = makeValidFiles();
    delete files[`${PACK_DIR}/manifest.json`];
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('manifest-missing');
  });

  it('reports an unparseable manifest', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/manifest.json`] = { content: '{not json' };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('manifest-unparseable');
  });

  it('reports a schema violation for a manifest missing embeddingDim', async () => {
    const manifest = makeManifest() as Record<string, unknown>;
    delete manifest.embeddingDim;
    const files = makeValidFiles();
    files[`${PACK_DIR}/manifest.json`] = { content: JSON.stringify(manifest) };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('manifest-schema');
  });

  it('rejects an unsupported major format version', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/manifest.json`] = {
      content: JSON.stringify(makeManifest({ formatVersion: '2.0' })),
    };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('unsupported-format-version');
  });

  it('accepts a newer minor format version', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/manifest.json`] = {
      content: JSON.stringify(makeManifest({ formatVersion: '1.3' })),
    };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(result.ok).toBe(true);
  });

  it('reports missing required files', async () => {
    const files = makeValidFiles();
    delete files[`${PACK_DIR}/embeddings/embeddings.bin`];
    delete files[`${PACK_DIR}/models/detector.onnx`];
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    const codes = errorCodes(result);
    expect(codes.filter((c) => c === 'file-missing')).toHaveLength(2);
  });

  it('reports an embeddings.bin size mismatch', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/embeddings.bin`] = { size: 156, hash: 'binhash' };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('embeddings-size-mismatch');
  });

  it('reports checksum mismatches', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/embeddings.bin`] = { size: 160, hash: 'WRONG' };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('checksum-mismatch');
  });

  it('compares checksums case-insensitively', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/embeddings.bin`] = { size: 160, hash: 'BINHASH' };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(result.ok).toBe(true);
  });

  it('skips checksum verification in cheap mode', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/embeddings.bin`] = { size: 160, hash: 'WRONG' };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR, { skipChecksums: true });

    expect(result.ok).toBe(true);
    expect(mockHash).not.toHaveBeenCalled();
  });

  it('reports an out-of-bounds individual offset range', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/index.json`] = {
      content: makeIndex([
        INDIVIDUAL_A,
        { ...INDIVIDUAL_B, embeddingOffset: 8, embeddingCount: 4 }, // 8+4 > 10
      ]),
    };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('index-out-of-bounds');
  });

  it('reports a negative individual offset', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/index.json`] = {
      content: makeIndex([{ ...INDIVIDUAL_A, embeddingOffset: -1 }]),
    };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('index-out-of-bounds');
  });

  it('reports an unparseable index file', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/index.json`] = { content: 'not json' };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    expect(errorCodes(result)).toContain('index-unparseable');
  });

  it('accumulates multiple independent errors', async () => {
    const files = makeValidFiles();
    files[`${PACK_DIR}/embeddings/embeddings.bin`] = { size: 160, hash: 'WRONG' };
    files[`${PACK_DIR}/embeddings/index.json`] = {
      content: makeIndex([{ ...INDIVIDUAL_A, embeddingOffset: 20 }]),
    };
    mockPackFs(files);

    const result = await validatePack(PACK_DIR);

    const codes = errorCodes(result);
    expect(codes).toContain('checksum-mismatch');
    expect(codes).toContain('index-out-of-bounds');
  });
});
