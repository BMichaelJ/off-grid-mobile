import { modelDownloadService } from '../../../src/services/modelDownloadService';
import type { ModelSource } from '../../../src/config/modelSources';

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
  hash: jest.fn(),
  moveFile: jest.fn(),
  downloadFile: jest.fn(),
  stopDownload: jest.fn(),
}));

import RNFS from 'react-native-fs';

const mockExists = RNFS.exists as jest.Mock;
const mockMkdir = RNFS.mkdir as jest.Mock;
const mockUnlink = RNFS.unlink as jest.Mock;
const mockStat = RNFS.stat as jest.Mock;
const mockHash = RNFS.hash as jest.Mock;
const mockMoveFile = RNFS.moveFile as jest.Mock;
const mockDownloadFile = RNFS.downloadFile as jest.Mock;
const mockStopDownload = RNFS.stopDownload as jest.Mock;

const STAGING_PATH = '/mock/documents/staging/miewid-4.1.0.onnx.part';
const FINAL_PATH = '/mock/documents/models/miewid-4.1.0.onnx';

const makeSource = (overrides: Partial<ModelSource> = {}): ModelSource => ({
  name: 'miewid',
  version: '4.1.0',
  url: 'https://example.org/miewid_v4_1_fp16.onnx',
  expectedSha256: 'abc123',
  expectedSizeBytes: 1000,
  ...overrides,
});

/** Configure downloadFile to resolve with the given results in sequence. */
const mockDownloadResults = (
  ...results: Array<{ statusCode?: number; reject?: Error }>
) => {
  results.forEach((result) => {
    mockDownloadFile.mockImplementationOnce(() => ({
      jobId: 7,
      promise: result.reject
        ? Promise.reject(result.reject)
        : Promise.resolve({
            statusCode: result.statusCode ?? 200,
            bytesWritten: 1000,
          }),
    }));
  });
};

describe('modelDownloadService.downloadModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExists.mockResolvedValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ size: 1000 });
    mockHash.mockResolvedValue('abc123');
    mockMoveFile.mockResolvedValue(undefined);
  });

  const fastOpts = { maxAttempts: 3, baseBackoffMs: 1 };

  it('downloads, verifies, and atomically moves the model into place', async () => {
    mockDownloadResults({ statusCode: 200 });

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toEqual({
      ok: true,
      path: FINAL_PATH,
      sha256: 'abc123',
      sizeBytes: 1000,
    });
    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUrl: 'https://example.org/miewid_v4_1_fp16.onnx',
        toFile: STAGING_PATH,
      }),
    );
    expect(mockMoveFile).toHaveBeenCalledWith(STAGING_PATH, FINAL_PATH);
    // Integrity must be proven before the file is promoted
    const hashOrder = mockHash.mock.invocationCallOrder[0];
    const moveOrder = mockMoveFile.mock.invocationCallOrder[0];
    expect(hashOrder).toBeLessThan(moveOrder);
  });

  it('fails without retry on a 404', async () => {
    mockDownloadResults({ statusCode: 404 });

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toMatchObject({ ok: false, code: 'http-error', httpStatus: 404 });
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    expect(mockMoveFile).not.toHaveBeenCalled();
  });

  it('retries a 503 and succeeds on the second attempt', async () => {
    mockDownloadResults({ statusCode: 503 }, { statusCode: 200 });

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toMatchObject({ ok: true });
    expect(mockDownloadFile).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on repeated network errors and cleans the staging file', async () => {
    mockDownloadResults(
      { reject: new Error('network down') },
      { reject: new Error('network down') },
      { reject: new Error('network down') },
    );
    mockExists.mockResolvedValue(true); // staging file present for cleanup

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toMatchObject({ ok: false, code: 'network-error' });
    expect(mockDownloadFile).toHaveBeenCalledTimes(3);
    expect(mockUnlink).toHaveBeenCalledWith(STAGING_PATH);
    expect(mockMoveFile).not.toHaveBeenCalled();
  });

  it('reports a length mismatch when the staged file size differs', async () => {
    mockDownloadResults({ statusCode: 200 }, { statusCode: 200 }, { statusCode: 200 });
    mockStat.mockResolvedValue({ size: 999 });

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toMatchObject({ ok: false, code: 'length-mismatch' });
    expect(mockHash).not.toHaveBeenCalled();
    expect(mockMoveFile).not.toHaveBeenCalled();
  });

  it('fails on persistent checksum mismatch and never promotes the file', async () => {
    mockDownloadResults({ statusCode: 200 }, { statusCode: 200 }, { statusCode: 200 });
    mockHash.mockResolvedValue('deadbeef');

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toMatchObject({ ok: false, code: 'checksum-mismatch' });
    expect(mockMoveFile).not.toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledWith(STAGING_PATH);
  });

  it('recovers when a checksum mismatch is transient', async () => {
    mockDownloadResults({ statusCode: 200 }, { statusCode: 200 });
    mockHash.mockResolvedValueOnce('deadbeef').mockResolvedValueOnce('abc123');

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toMatchObject({ ok: true });
    expect(mockDownloadFile).toHaveBeenCalledTimes(2);
  });

  it('compares checksums case-insensitively', async () => {
    mockDownloadResults({ statusCode: 200 });
    mockHash.mockResolvedValue('ABC123');

    const outcome = await modelDownloadService.downloadModel(makeSource(), fastOpts);

    expect(outcome).toMatchObject({ ok: true });
  });

  it('cancels an in-flight download via AbortSignal', async () => {
    const controller = new AbortController();
    let rejectDownload: (e: Error) => void = () => {};
    mockDownloadFile.mockImplementationOnce(() => ({
      jobId: 42,
      promise: new Promise((_, reject) => {
        rejectDownload = reject;
      }),
    }));
    mockStopDownload.mockImplementation(() => {
      rejectDownload(new Error('aborted'));
    });

    const pending = modelDownloadService.downloadModel(makeSource(), {
      ...fastOpts,
      signal: controller.signal,
    });
    controller.abort();
    const outcome = await pending;

    expect(mockStopDownload).toHaveBeenCalledWith(42);
    expect(outcome).toMatchObject({ ok: false, code: 'cancelled' });
    expect(mockDownloadFile).toHaveBeenCalledTimes(1); // no retry after cancel
  });

  it('removes a stale staging file before downloading', async () => {
    mockExists.mockImplementation(async (path: string) => path === STAGING_PATH);
    mockDownloadResults({ statusCode: 200 });

    await modelDownloadService.downloadModel(makeSource(), fastOpts);

    const unlinkOrder = mockUnlink.mock.invocationCallOrder[0];
    const downloadOrder = mockDownloadFile.mock.invocationCallOrder[0];
    expect(mockUnlink).toHaveBeenCalledWith(STAGING_PATH);
    expect(unlinkOrder).toBeLessThan(downloadOrder);
  });

  it('reports download progress', async () => {
    mockDownloadFile.mockImplementationOnce(
      (options: { progress?: (r: { bytesWritten: number; contentLength: number }) => void }) => {
        options.progress?.({ bytesWritten: 500, contentLength: 1000 });
        return {
          jobId: 7,
          promise: Promise.resolve({ statusCode: 200, bytesWritten: 1000 }),
        };
      },
    );
    const onProgress = jest.fn();

    await modelDownloadService.downloadModel(makeSource(), {
      ...fastOpts,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(500, 1000);
  });
});
