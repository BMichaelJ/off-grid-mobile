import { ganeshaApiClient } from '../ganeshaApiClient';
import type { GaneshaApiErrorCode } from '../ganeshaApiClient';
import { MIEWID_MODEL_NAME } from '../../config/modelSources';
import type { ModelSource } from '../../config/modelSources';
import type { ModelFormat } from '../../types/wildlife';
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
 * Derive the artifact's runtime from its download filename. The backend
 * response has no explicit format field today, so the file itself is the
 * source of truth; anything not recognized as LiteRT's `.tflite` is treated
 * as the long-standing ONNX default. A future backend contract that
 * declares format/input-layout explicitly (WS7 step 1) can replace this
 * without changing resolveMiewidModelSource's return shape.
 */
function formatFromUrl(url: string): ModelFormat {
  const path = url.split('?')[0] ?? url;
  return path.toLowerCase().endsWith('.tflite') ? 'tflite' : 'onnx';
}

/**
 * Resolve a MiewID model download source from the Ganesha backend
 * (`GET /models/{model_name}/latest`, backend commit 8e005d9) into the shape
 * `acquireMiewidModel()` expects. The backend's `downloadUrl` is a
 * short-lived read-SAS URL (~1hr expiry observed) — callers must resolve
 * immediately before downloading, not cache the resolved source across a
 * long-running flow or app restart.
 *
 * `modelName` defaults to the ONNX artifact (`MIEWID_MODEL_NAME`); pass
 * `MIEWID_LITERT_MODEL_NAME` to resolve the LiteRT/GPU artifact instead
 * (WS7).
 */
export async function resolveMiewidModelSource(
  modelName: string = MIEWID_MODEL_NAME,
): Promise<ResolveModelSourceResult> {
  const result = await ganeshaApiClient.getLatestModel(modelName);
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
      format: formatFromUrl(data.downloadUrl),
    },
  };
}
