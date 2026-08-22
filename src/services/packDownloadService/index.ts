import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { ganeshaApiClient } from '../ganeshaApiClient';
import { downloadFileWithIntegrityCheck } from '../fileDownloadService';
import type { DownloadOptions } from '../fileDownloadService';
import { packManager } from '../packManager';
import { resolvePackFile } from '../packManager/validator';
import { useWildlifeStore } from '../../stores/wildlifeStore';
import type { EmbeddingPack } from '../../types';
import type { PackAcquisitionOutcome } from './types';
import logger from '../../utils/logger';

/**
 * Fetches the latest embedding pack for a project from the Ganesha backend
 * (`GET /projects/{project_id}/packs/latest`), downloads the zip with the
 * same retry/checksum/atomic-move guarantees `modelDownloadService`
 * established (shared via `fileDownloadService`), unzips it, validates +
 * installs it via `packManager`, and registers the result in the wildlife
 * store. One pack per project: re-running this for the same `projectId`
 * replaces the previously installed pack, matching `addPack`'s
 * dedupe-by-id behavior.
 */

const packDownloadsDir = () => `${RNFS.DocumentDirectoryPath}/pack_downloads`;
const stagingDir = () => `${RNFS.DocumentDirectoryPath}/staging`;

/** Filesystem-safe: pack versions are free-form (e.g. ISO timestamps with colons). */
const sanitizeForPath = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, '_');

const zipStagingPathFor = (projectId: string, version: string) =>
  `${stagingDir()}/pack-${sanitizeForPath(projectId)}-${sanitizeForPath(
    version,
  )}.zip.part`;
const zipFinalPathFor = (projectId: string, version: string) =>
  `${packDownloadsDir()}/${sanitizeForPath(projectId)}-${sanitizeForPath(
    version,
  )}.zip`;
const extractDirFor = (projectId: string) =>
  `${packManager.getPacksDir()}/${sanitizeForPath(projectId)}`;

async function removeIfExists(path: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  } catch (error) {
    logger.warn(
      `[PackDownload] Failed to remove ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function acquireLatestPack(
  projectId: string,
  opts: DownloadOptions = {},
): Promise<PackAcquisitionOutcome> {
  const resolved = await ganeshaApiClient.getLatestPack(projectId);
  if (!resolved.ok) {
    return resolved;
  }
  const info = resolved.data;

  await RNFS.mkdir(packDownloadsDir());
  const zipStaging = zipStagingPathFor(projectId, info.version);
  const zipFinal = zipFinalPathFor(projectId, info.version);

  const downloadOutcome = await downloadFileWithIntegrityCheck(
    {
      source: {
        url: info.downloadUrl,
        expectedSha256: info.sha256,
        expectedSizeBytes: info.sizeBytes,
      },
      stagingPath: zipStaging,
      finalPath: zipFinal,
    },
    opts,
  );
  if (!downloadOutcome.ok) {
    return downloadOutcome;
  }

  const extractDir = extractDirFor(projectId);
  try {
    await packManager.initialize();
    // A prior install at this path must be fully cleared first -- unzip
    // does not guarantee it overwrites-in-place cleanly, and a stale file
    // from an older pack version left behind would silently corrupt the
    // new one.
    await removeIfExists(extractDir);
    await unzip(downloadOutcome.path, extractDir);
  } catch (error) {
    await removeIfExists(downloadOutcome.path);
    return {
      ok: false,
      code: 'unzip-failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  // The raw zip is no longer needed once extracted -- its contents now live
  // on disk as the pack directory, and re-downloading is cheap if ever
  // needed again.
  await removeIfExists(downloadOutcome.path);

  const validation = await packManager.installPack(extractDir);
  if (!validation.ok) {
    await removeIfExists(extractDir);
    return {
      ok: false,
      code: 'validation-failed',
      message: validation.errors.map(e => `${e.code}: ${e.detail}`).join('; '),
    };
  }

  const { manifest } = validation;
  const pack: EmbeddingPack = {
    id: projectId,
    species: manifest.species,
    featureClass: manifest.featureClass,
    displayName: info.displayName ?? manifest.displayName,
    wildbookInstanceUrl: manifest.wildbookInstanceUrl,
    exportDate: manifest.exportDate,
    individualCount: manifest.individualCount,
    embeddingDim: manifest.embeddingDim,
    embeddingModelVersion: manifest.embeddingModel.version,
    detectorModelFile:
      (await resolvePackFile(extractDir, manifest.detectorModel.filename)) ??
      `${extractDir}/models/${manifest.detectorModel.filename}`,
    embeddingsFile:
      (await resolvePackFile(extractDir, 'embeddings.bin')) ??
      `${extractDir}/embeddings/embeddings.bin`,
    indexFile:
      (await resolvePackFile(extractDir, 'index.json')) ??
      `${extractDir}/embeddings/index.json`,
    referencePhotosDir: `${extractDir}/reference_photos`,
    packDir: extractDir,
    downloadedAt: new Date().toISOString(),
    sizeBytes: downloadOutcome.sizeBytes,
    status: 'ready',
    validatedAt: new Date().toISOString(),
  };

  useWildlifeStore.getState().addPack(pack);
  logger.log(
    `[PackDownload] Installed pack ${pack.id} (${pack.individualCount} individuals) at ${extractDir}`,
  );
  return { ok: true, pack };
}

export type { PackAcquisitionOutcome, PackAcquisitionErrorCode } from './types';
