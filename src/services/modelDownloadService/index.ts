import RNFS from 'react-native-fs';
import type { ModelSource } from '../../config/modelSources';
import type { DownloadErrorCode, DownloadOptions, DownloadOutcome } from './types';
import logger from '../../utils/logger';

/**
 * JS download service with integrity guarantees the native download layer
 * lacks: staging-path download, HTTP status check, expected-length check,
 * SHA-256 verification, and an atomic same-filesystem move into the model
 * cache. Built on RNFS.downloadFile — the native DownloadManagerModule has
 * no JS binding, no checksum support, and a non-atomic cross-filesystem
 * move; revisit it only if background/resumable downloads become a
 * requirement (Stage 2.8).
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 1000;

/** Staging lives on the same filesystem as the destination so the final
 * moveFile is an atomic rename — a crash never leaves a half-written file
 * at the destination path. */
const stagingDir = () => `${RNFS.DocumentDirectoryPath}/staging`;
const modelsDir = () => `${RNFS.DocumentDirectoryPath}/models`;

const stagingPathFor = (source: ModelSource) =>
  `${stagingDir()}/${source.name}-${source.version}.onnx.part`;
const finalPathFor = (source: ModelSource) =>
  `${modelsDir()}/${source.name}-${source.version}.onnx`;

const RETRYABLE_CODES: ReadonlySet<DownloadErrorCode> = new Set([
  'network-error',
  'length-mismatch',
  'checksum-mismatch',
]);

const isRetryable = (outcome: DownloadOutcome): boolean => {
  if (outcome.ok) {
    return false;
  }
  if (outcome.code === 'http-error') {
    // Server-side failures are worth retrying; client errors are not.
    return outcome.httpStatus !== undefined && outcome.httpStatus >= 500;
  }
  return RETRYABLE_CODES.has(outcome.code);
};

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const failure = (
  code: DownloadErrorCode,
  message: string,
  httpStatus?: number,
): DownloadOutcome => ({ ok: false, code, message, httpStatus });

class ModelDownloadService {
  async downloadModel(
    source: ModelSource,
    opts: DownloadOptions = {},
  ): Promise<DownloadOutcome> {
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    const staging = stagingPathFor(source);

    let outcome: DownloadOutcome = failure(
      'network-error',
      'download never attempted',
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (opts.signal?.aborted) {
        outcome = failure('cancelled', 'download cancelled');
        break;
      }
      if (attempt > 0) {
        // Exponential backoff with full jitter.
        const backoff =
          baseBackoffMs * 2 ** (attempt - 1) * (0.5 + Math.random() / 2);
        await delay(backoff, opts.signal);
        if (opts.signal?.aborted) {
          outcome = failure('cancelled', 'download cancelled');
          break;
        }
      }

      outcome = await this.attemptDownload(source, staging, opts);
      if (outcome.ok || !isRetryable(outcome)) {
        break;
      }
      logger.warn(
        `[ModelDownload] Attempt ${attempt + 1}/${maxAttempts} for ${source.name} failed (${outcome.code}); ${attempt + 1 < maxAttempts ? 'retrying' : 'giving up'}`,
      );
    }

    if (!outcome.ok) {
      await this.cleanupStaging(staging);
    }
    return outcome;
  }

  private async attemptDownload(
    source: ModelSource,
    staging: string,
    opts: DownloadOptions,
  ): Promise<DownloadOutcome> {
    await RNFS.mkdir(stagingDir());
    await RNFS.mkdir(modelsDir());
    await this.cleanupStaging(staging);

    let contentLengthFromServer = 0;
    const { jobId, promise } = RNFS.downloadFile({
      fromUrl: source.url,
      toFile: staging,
      headers: source.headers,
      progressDivider: 5,
      begin: (res: { contentLength: number }) => {
        contentLengthFromServer = res.contentLength;
      },
      progress: (res: { bytesWritten: number; contentLength: number }) => {
        opts.onProgress?.(res.bytesWritten, res.contentLength);
      },
    });

    const onAbort = () => RNFS.stopDownload(jobId);
    if (opts.signal?.aborted) {
      // The signal aborted before we could listen — an aborted signal never
      // fires 'abort' again, so stop the job directly.
      onAbort();
    } else {
      opts.signal?.addEventListener('abort', onAbort, { once: true });
    }

    let statusCode: number;
    try {
      const result = await promise;
      statusCode = result.statusCode;
    } catch (error) {
      if (opts.signal?.aborted) {
        return failure('cancelled', 'download cancelled');
      }
      return failure(
        'network-error',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
    }

    if (opts.signal?.aborted) {
      return failure('cancelled', 'download cancelled');
    }
    if (statusCode < 200 || statusCode >= 300) {
      return failure('http-error', `HTTP ${statusCode}`, statusCode);
    }

    // Length check: prefer the source's declared size, fall back to the
    // server's content-length when it sent one.
    const stat = await RNFS.stat(staging);
    const actualSize = Number(stat.size);
    const expectedSize = source.expectedSizeBytes ?? contentLengthFromServer;
    if (expectedSize > 0 && actualSize !== expectedSize) {
      return failure(
        'length-mismatch',
        `downloaded ${actualSize} bytes, expected ${expectedSize}`,
      );
    }

    const actualHash = (await RNFS.hash(staging, 'sha256')).toLowerCase();
    if (actualHash !== source.expectedSha256.toLowerCase()) {
      return failure(
        'checksum-mismatch',
        `SHA-256 ${actualHash} does not match expected ${source.expectedSha256}`,
      );
    }

    const finalPath = finalPathFor(source);
    try {
      await RNFS.moveFile(staging, finalPath);
    } catch (error) {
      return failure(
        'move-failed',
        error instanceof Error ? error.message : String(error),
      );
    }

    logger.log(
      `[ModelDownload] ${source.name}@${source.version} verified and installed at ${finalPath}`,
    );
    return { ok: true, path: finalPath, sha256: actualHash, sizeBytes: actualSize };
  }

  private async cleanupStaging(staging: string): Promise<void> {
    try {
      await RNFS.unlink(staging);
    } catch {
      // Missing staging file is the normal case; anything else is best-effort.
    }
  }
}

export const modelDownloadService = new ModelDownloadService();
export type { DownloadOptions, DownloadOutcome, DownloadErrorCode } from './types';
