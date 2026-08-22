import { acquireLatestPack } from '../../../src/services/packDownloadService';
import { useWildlifeStore } from '../../../src/stores/wildlifeStore';
import type { EmbeddingPackManifest, PackIndividual } from '../../../src/types';

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn(),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-zip-archive', () => ({
  unzip: jest.fn(),
}));

jest.mock('../../../src/services/ganeshaApiClient', () => ({
  ganeshaApiClient: { getLatestPack: jest.fn() },
}));

jest.mock('../../../src/services/fileDownloadService', () => ({
  downloadFileWithIntegrityCheck: jest.fn(),
}));

jest.mock('../../../src/services/packManager', () => ({
  packManager: {
    initialize: jest.fn(() => Promise.resolve()),
    installPack: jest.fn(),
    getPacksDir: jest.fn(() => '/mock/documents/embedding_packs'),
  },
}));

jest.mock('../../../src/services/packManager/validator', () => ({
  resolvePackFile: jest.fn(),
}));

import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { ganeshaApiClient } from '../../../src/services/ganeshaApiClient';
import { downloadFileWithIntegrityCheck } from '../../../src/services/fileDownloadService';
import { packManager } from '../../../src/services/packManager';
import { resolvePackFile } from '../../../src/services/packManager/validator';

const mockExists = RNFS.exists as jest.Mock;
const mockMkdir = RNFS.mkdir as jest.Mock;
const mockUnlink = RNFS.unlink as jest.Mock;
const mockUnzip = unzip as jest.Mock;
const mockGetLatestPack = ganeshaApiClient.getLatestPack as jest.Mock;
const mockDownload = downloadFileWithIntegrityCheck as jest.Mock;
const mockInstallPack = packManager.installPack as jest.Mock;
const mockResolvePackFile = resolvePackFile as jest.Mock;

const PROJECT_ID = 'proj_kariega';
const EXTRACT_DIR = '/mock/documents/embedding_packs/proj_kariega';
const ZIP_FINAL_PATH = expect.stringContaining(
  '/mock/documents/pack_downloads/proj_kariega-',
);

const makePackInfo = (overrides: Partial<Record<string, unknown>> = {}) => ({
  projectId: PROJECT_ID,
  displayName: 'Kariega Elephants',
  version: '2026-08-22T12:38:40Z',
  sha256: 'ebed1d341b58034de6108a5b138373aa64a7e8458bc43e43909ad0850bf660ba',
  sizeBytes: 20_684_583,
  individualCount: 3,
  embeddingCount: 141,
  downloadUrl:
    'https://ganeshasfc2o4rujo76u.blob.core.windows.net/wildlife-packs/proj_kariega/wildbook-pack-kariega.zip?sig=x',
  ...overrides,
});

const makeManifest = (
  overrides: Partial<EmbeddingPackManifest> = {},
): EmbeddingPackManifest => ({
  formatVersion: '1.0',
  species: 'Loxodonta africana',
  featureClass: 'elephant+ear',
  displayName: 'Kariega Elephants',
  wildbookInstanceUrl: 'https://kariega.wildbook.org',
  exportDate: '2026-08-22T12:38:40Z',
  individualCount: 3,
  embeddingCount: 141,
  embeddingDim: 2152,
  embeddingModel: {
    name: 'miewid',
    version: '4.1.0',
    inputSize: [440, 440],
    normalize: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
  },
  detectorModel: {
    filename: 'elephant-yolo11n.onnx',
    configFile: 'config/detector.json',
  },
  ...overrides,
});

const makeIndividuals = (): PackIndividual[] => [];

describe('acquireLatestPack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWildlifeStore.getState().reset();
    // Files "exist" by default (staging/extract-dir cleanup calls unlink
    // only when RNFS.exists is true) — the one test exercising "nothing to
    // clean up yet" overrides this per-path.
    mockExists.mockResolvedValue(true);
    mockDownload.mockResolvedValue({
      ok: true,
      path: '/mock/documents/pack_downloads/proj_kariega-2026-08-22T12_38_40Z.zip',
      sha256:
        'ebed1d341b58034de6108a5b138373aa64a7e8458bc43e43909ad0850bf660ba',
      sizeBytes: 20_684_583,
    });
    mockUnzip.mockResolvedValue(EXTRACT_DIR);
    mockInstallPack.mockResolvedValue({
      ok: true,
      manifest: makeManifest(),
      individuals: makeIndividuals(),
    });
    mockResolvePackFile.mockImplementation((packDir: string, name: string) =>
      Promise.resolve(`${packDir}/resolved/${name}`),
    );
  });

  it('resolves, downloads, unzips, validates, installs, and registers the pack', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });

    const result = await acquireLatestPack(PROJECT_ID);

    expect(mockGetLatestPack).toHaveBeenCalledWith(PROJECT_ID);
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          url: makePackInfo().downloadUrl,
          expectedSha256: makePackInfo().sha256,
          expectedSizeBytes: makePackInfo().sizeBytes,
        }),
        stagingPath: expect.any(String),
        finalPath: ZIP_FINAL_PATH,
      }),
      {},
    );
    expect(mockUnzip).toHaveBeenCalledWith(
      '/mock/documents/pack_downloads/proj_kariega-2026-08-22T12_38_40Z.zip',
      EXTRACT_DIR,
    );
    expect(mockInstallPack).toHaveBeenCalledWith(EXTRACT_DIR);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok result');
    }
    expect(result.pack).toMatchObject({
      id: PROJECT_ID,
      species: 'Loxodonta africana',
      featureClass: 'elephant+ear',
      displayName: 'Kariega Elephants',
      individualCount: 3,
      embeddingDim: 2152,
      embeddingModelVersion: '4.1.0',
      packDir: EXTRACT_DIR,
      sizeBytes: 20_684_583,
      status: 'ready',
    });
    expect(result.pack.embeddingsFile).toBe(
      `${EXTRACT_DIR}/resolved/embeddings.bin`,
    );
    expect(result.pack.indexFile).toBe(`${EXTRACT_DIR}/resolved/index.json`);
    expect(result.pack.detectorModelFile).toBe(
      `${EXTRACT_DIR}/resolved/elephant-yolo11n.onnx`,
    );
    expect(result.pack.referencePhotosDir).toBe(
      `${EXTRACT_DIR}/reference_photos`,
    );

    expect(useWildlifeStore.getState().packs).toHaveLength(1);
    expect(useWildlifeStore.getState().packs[0].id).toBe(PROJECT_ID);

    // The downloaded zip is cleaned up once its contents are extracted.
    expect(mockUnlink).toHaveBeenCalledWith(
      '/mock/documents/pack_downloads/proj_kariega-2026-08-22T12_38_40Z.zip',
    );
  });

  it('replaces a previously installed pack for the same project', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });
    await acquireLatestPack(PROJECT_ID);
    await acquireLatestPack(PROJECT_ID);

    expect(useWildlifeStore.getState().packs).toHaveLength(1);
  });

  it('clears a stale extract directory before unzipping', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });
    mockExists.mockImplementation((path: string) =>
      Promise.resolve(path === EXTRACT_DIR),
    );

    await acquireLatestPack(PROJECT_ID);

    const unlinkOrder = mockUnlink.mock.invocationCallOrder.find(
      (_, i) => mockUnlink.mock.calls[i][0] === EXTRACT_DIR,
    );
    const unzipOrder = mockUnzip.mock.invocationCallOrder[0];
    expect(unlinkOrder).toBeLessThan(unzipOrder);
  });

  it('passes through a not-found error from the backend without downloading', async () => {
    mockGetLatestPack.mockResolvedValue({
      ok: false,
      code: 'not-found',
      message: 'HTTP 404',
      httpStatus: 404,
    });

    const result = await acquireLatestPack(PROJECT_ID);

    expect(result).toEqual({
      ok: false,
      code: 'not-found',
      message: 'HTTP 404',
      httpStatus: 404,
    });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('passes through a download failure without unzipping', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });
    mockDownload.mockResolvedValue({
      ok: false,
      code: 'checksum-mismatch',
      message: 'bad hash',
    });

    const result = await acquireLatestPack(PROJECT_ID);

    expect(result).toEqual({
      ok: false,
      code: 'checksum-mismatch',
      message: 'bad hash',
    });
    expect(mockUnzip).not.toHaveBeenCalled();
    expect(useWildlifeStore.getState().packs).toHaveLength(0);
  });

  it('returns unzip-failed and cleans up the zip when extraction throws', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });
    mockUnzip.mockRejectedValue(new Error('corrupt zip'));

    const result = await acquireLatestPack(PROJECT_ID);

    expect(result).toEqual({
      ok: false,
      code: 'unzip-failed',
      message: 'corrupt zip',
    });
    expect(mockInstallPack).not.toHaveBeenCalled();
    expect(useWildlifeStore.getState().packs).toHaveLength(0);
  });

  it('returns validation-failed and quarantine-cleans the extracted dir on invalid pack contents', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });
    mockInstallPack.mockResolvedValue({
      ok: false,
      errors: [{ code: 'file-missing', detail: 'embeddings.bin' }],
    });

    const result = await acquireLatestPack(PROJECT_ID);

    expect(result).toEqual({
      ok: false,
      code: 'validation-failed',
      message: 'file-missing: embeddings.bin',
    });
    expect(useWildlifeStore.getState().packs).toHaveLength(0);
  });

  it('forwards download options (progress/signal) to the file download engine', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });
    const onProgress = jest.fn();

    await acquireLatestPack(PROJECT_ID, { onProgress, maxAttempts: 5 });

    expect(mockDownload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onProgress, maxAttempts: 5 }),
    );
  });

  it('creates the pack downloads directory before downloading', async () => {
    mockGetLatestPack.mockResolvedValue({ ok: true, data: makePackInfo() });

    await acquireLatestPack(PROJECT_ID);

    expect(mockMkdir).toHaveBeenCalledWith('/mock/documents/pack_downloads');
  });
});
