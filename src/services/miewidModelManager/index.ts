import RNFS from 'react-native-fs';
import type { MiewIDModelRecord } from '../../types';
import logger from '../../utils/logger';

export type EmbeddingModelCompatibility =
  | 'compatible'
  | 'minor-mismatch'
  | 'incompatible';

/**
 * Extract [major, minor] from a version string like "4.1.0", "v4.1", or "4".
 * Returns null when no leading numeric component can be found.
 */
function parseMajorMinor(version: string): [number, number] | null {
  const match = /^v?(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2] ?? 0)];
}

/**
 * Gate a pack's embedding-model version against the installed MiewID model.
 *
 * Major mismatch → 'incompatible' (embeddings live in different spaces and
 * must never be matched against each other). Minor mismatch or an
 * unparseable/unknown version on either side → 'minor-mismatch' (warn but
 * proceed — legacy migrated records have version 'unknown' and must not be
 * bricked).
 */
export function checkEmbeddingModelCompatibility(
  modelVersion: string,
  packVersion: string,
): EmbeddingModelCompatibility {
  const model = parseMajorMinor(modelVersion);
  const pack = parseMajorMinor(packVersion);
  if (!model || !pack) {
    return 'minor-mismatch';
  }
  if (model[0] !== pack[0]) {
    return 'incompatible';
  }
  return model[1] === pack[1] ? 'compatible' : 'minor-mismatch';
}

/**
 * Reconcile a persisted MiewID model record against the filesystem.
 *
 * Called on app startup after store hydration. Cheap by default: a record
 * that has already been hash-verified (`verifiedAt` set) only gets an
 * existence + size check; the full SHA-256 (1-2s for a ~100 MB model) runs
 * once after download or for legacy records that never recorded a hash.
 */
export async function reconcileMiewidModel(
  record: MiewIDModelRecord | null,
): Promise<MiewIDModelRecord | null> {
  if (!record) {
    return null;
  }

  // An app killed mid-download leaves a dangling 'downloading' status; the
  // staging file (if any) is owned by the download service, not this record.
  if (record.status === 'downloading') {
    return { ...record, status: 'missing' };
  }

  try {
    if (!(await RNFS.exists(record.path))) {
      return { ...record, status: 'missing' };
    }

    const stat = await RNFS.stat(record.path);
    const actualSize = Number(stat.size);

    if (record.sizeBytes != null && actualSize !== record.sizeBytes) {
      logger.warn(
        `[MiewIDModelManager] Size mismatch for ${record.path}: expected ${record.sizeBytes}, found ${actualSize}`,
      );
      return { ...record, status: 'corrupt' };
    }

    if (record.sha256 != null) {
      if (record.verifiedAt != null) {
        // Already hash-verified once; size check above is sufficient.
        return { ...record, status: 'ready' };
      }
      const actualHash = await RNFS.hash(record.path, 'sha256');
      if (actualHash.toLowerCase() !== record.sha256.toLowerCase()) {
        logger.warn(
          `[MiewIDModelManager] SHA-256 mismatch for ${record.path}`,
        );
        return { ...record, status: 'corrupt', sizeBytes: actualSize };
      }
      return {
        ...record,
        status: 'ready',
        sizeBytes: actualSize,
        verifiedAt: new Date().toISOString(),
      };
    }

    // Legacy record (migrated from the bare-path format): no expected hash.
    // Require a non-empty file, then backfill identity for future checks.
    if (actualSize <= 0) {
      return { ...record, status: 'corrupt' };
    }
    const computedHash = await RNFS.hash(record.path, 'sha256');
    return {
      ...record,
      status: 'ready',
      sha256: computedHash,
      sizeBytes: actualSize,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(
      `[MiewIDModelManager] Reconciliation failed for ${record.path}:`,
      error,
    );
    return { ...record, status: 'corrupt' };
  }
}
