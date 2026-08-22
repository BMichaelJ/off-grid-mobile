import { ganeshaApiClient } from '../ganeshaApiClient';
import type { GaneshaApiErrorCode } from '../ganeshaApiClient';
import { MIEWID_MODEL_NAME } from '../../config/modelSources';
import type { ModelSource } from '../../config/modelSources';
import logger from '../../utils/logger';

export type ResolveModelSourceResult =
  | { ok: true; source: ModelSource }
  | {
      ok: false;
      code: GaneshaApiErrorCode;
      message: string;
      httpStatus?: number;
    };

/**
 * Resolve the current MiewID model download source from the Ganesha backend
 * (`GET /models/{model_name}/latest`, backend commit 8e005d9) into the shape
 * `acquireMiewidModel()` expects. The backend's `downloadUrl` is a
 * short-lived read-SAS URL (~1hr expiry observed) — callers must resolve
 * immediately before downloading, not cache the resolved source across a
 * long-running flow or app restart.
 */
export async function resolveMiewidModelSource(): Promise<ResolveModelSourceResult> {
  const result = await ganeshaApiClient.getLatestModel(MIEWID_MODEL_NAME);
  if (!result.ok) {
    logger.warn(
      `[resolveMiewidModelSource] Failed to resolve model source: ${result.code} (${result.message})`,
    );
    return result;
  }

  const { data } = result;
  return {
    ok: true,
    source: {
      name: data.name,
      version: data.version,
      url: data.downloadUrl,
      expectedSha256: data.sha256,
      expectedSizeBytes: data.sizeBytes,
    },
  };
}
