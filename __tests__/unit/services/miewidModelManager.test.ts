import {
  reconcileMiewidModel,
  checkEmbeddingModelCompatibility,
} from '../../../src/services/miewidModelManager';
import type { MiewIDModelRecord } from '../../../src/types';

jest.mock('react-native-fs', () => ({
  exists: jest.fn(),
  stat: jest.fn(),
  hash: jest.fn(),
}));

import RNFS from 'react-native-fs';

const mockExists = RNFS.exists as jest.Mock;
const mockStat = RNFS.stat as jest.Mock;
const mockHash = RNFS.hash as jest.Mock;

const makeRecord = (
  overrides: Partial<MiewIDModelRecord> = {},
): MiewIDModelRecord => ({
  path: '/mock/documents/models/miewid-4.1.0.onnx',
  name: 'miewid',
  version: '4.1.0',
  sha256: 'abc123',
  sizeBytes: 103_859_027,
  status: 'ready',
  verifiedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

describe('reconcileMiewidModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for a null record', async () => {
    expect(await reconcileMiewidModel(null)).toBeNull();
  });

  it('marks an interrupted download as missing', async () => {
    const record = makeRecord({ status: 'downloading', verifiedAt: null });

    const result = await reconcileMiewidModel(record);

    expect(result?.status).toBe('missing');
  });

  it('marks the record missing when the file does not exist', async () => {
    mockExists.mockResolvedValue(false);

    const result = await reconcileMiewidModel(makeRecord());

    expect(result?.status).toBe('missing');
    expect(mockStat).not.toHaveBeenCalled();
  });

  it('marks the record corrupt on file size mismatch', async () => {
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({ size: 12345 });

    const result = await reconcileMiewidModel(makeRecord());

    expect(result?.status).toBe('corrupt');
    expect(mockHash).not.toHaveBeenCalled();
  });

  it('skips hashing for an already-verified record with intact size', async () => {
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({ size: 103_859_027 });

    const result = await reconcileMiewidModel(makeRecord());

    expect(result?.status).toBe('ready');
    expect(mockHash).not.toHaveBeenCalled();
  });

  it('hashes an unverified record and marks it ready on match', async () => {
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({ size: 103_859_027 });
    mockHash.mockResolvedValue('abc123');
    const record = makeRecord({ verifiedAt: null });

    const result = await reconcileMiewidModel(record);

    expect(mockHash).toHaveBeenCalledWith(record.path, 'sha256');
    expect(result?.status).toBe('ready');
    expect(result?.verifiedAt).not.toBeNull();
  });

  it('marks an unverified record corrupt on hash mismatch', async () => {
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({ size: 103_859_027 });
    mockHash.mockResolvedValue('deadbeef');

    const result = await reconcileMiewidModel(makeRecord({ verifiedAt: null }));

    expect(result?.status).toBe('corrupt');
  });

  it('compares hashes case-insensitively', async () => {
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({ size: 103_859_027 });
    mockHash.mockResolvedValue('ABC123');

    const result = await reconcileMiewidModel(makeRecord({ verifiedAt: null }));

    expect(result?.status).toBe('ready');
  });

  it('backfills size and hash for a legacy record without sha256', async () => {
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({ size: 999 });
    mockHash.mockResolvedValue('computedhash');
    const legacy = makeRecord({
      sha256: null,
      sizeBytes: null,
      status: 'missing',
      verifiedAt: null,
      version: 'unknown',
    });

    const result = await reconcileMiewidModel(legacy);

    expect(result?.status).toBe('ready');
    expect(result?.sizeBytes).toBe(999);
    expect(result?.sha256).toBe('computedhash');
    expect(result?.verifiedAt).not.toBeNull();
  });

  it('marks a legacy record with an empty file as corrupt', async () => {
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue({ size: 0 });

    const result = await reconcileMiewidModel(
      makeRecord({ sha256: null, sizeBytes: null, verifiedAt: null }),
    );

    expect(result?.status).toBe('corrupt');
  });

  it('marks the record corrupt when filesystem calls fail', async () => {
    mockExists.mockRejectedValue(new Error('fs unavailable'));

    const result = await reconcileMiewidModel(makeRecord());

    expect(result?.status).toBe('corrupt');
  });
});

describe('checkEmbeddingModelCompatibility', () => {
  it.each([
    ['4.1.0', '4.1.0', 'compatible'],
    ['4.1.0', '4.1.3', 'compatible'],
    ['v4.1', '4.1.0', 'compatible'],
    ['4.1.0', '4.2.0', 'minor-mismatch'],
    ['4.2.0', '4.1.0', 'minor-mismatch'],
    ['4.1.0', '5.0.0', 'incompatible'],
    ['5.0.0', '4.1.0', 'incompatible'],
    ['unknown', '4.1.0', 'minor-mismatch'],
    ['4.1.0', 'garbage', 'minor-mismatch'],
    ['', '4.1.0', 'minor-mismatch'],
  ])('(%s, %s) → %s', (modelVersion, packVersion, expected) => {
    expect(checkEmbeddingModelCompatibility(modelVersion, packVersion)).toBe(
      expected,
    );
  });
});
