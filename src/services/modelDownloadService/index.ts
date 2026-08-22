import RNFS from 'react-native-fs';
import type { ModelSource } from '../../config/modelSources';
import { downloadFileWithIntegrityCheck } from '../fileDownloadService';
import type { DownloadOptions, DownloadOutcome } from './types';
import logger from '../../utils/logger';

/**
 * Model-specific staging/destination paths on top of the shared
 * fileDownloadService engine (staging-path download, HTTP status check,
 * expected-length check, SHA-256 verification, retry/backoff, and an atomic
 * same-filesystem move into the model cache). Built on RNFS.downloadFile —
 * the native DownloadManagerModule has no JS binding, no checksum support,
 * and a non-atomic cross-filesystem move; revisit it only if
 * background/resumable downloads become a requirement (Stage 2.8).
 */

/** Staging lives on the same filesystem as the destination so the final
 * move is an atomic rename — a crash never leaves a half-written file at
 * the destination path. */
const stagingDir = () => `${RNFS.DocumentDirectoryPath}/staging`;
const modelsDir = () => `${RNFS.DocumentDirectoryPath}/models`;

const stagingPathFor = (source: ModelSource) =>
  `${stagingDir()}/${source.name}-${source.version}.onnx.part`;
const finalPathFor = (source: ModelSource) =>
  `${modelsDir()}/${source.name}-${source.version}.onnx`;

class ModelDownloadService {
  async downloadModel(
    source: ModelSource,
    opts: DownloadOptions = {},
  ): Promise<DownloadOutcome> {
    const outcome = await downloadFileWithIntegrityCheck(
      {
        source: {
          url: source.url,
          expectedSha256: source.expectedSha256,
          expectedSizeBytes: source.expectedSizeBytes,
          headers: source.headers,
        },
        stagingPath: stagingPathFor(source),
        finalPath: finalPathFor(source),
      },
      opts,
    );

    if (outcome.ok) {
      logger.log(
        `[ModelDownload] ${source.name}@${source.version} verified and installed at ${outcome.path}`,
      );
    }
    return outcome;
  }
}

export const modelDownloadService = new ModelDownloadService();
export type {
  DownloadOptions,
  DownloadOutcome,
  DownloadErrorCode,
} from './types';
