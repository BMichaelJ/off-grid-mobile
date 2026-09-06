import type { ModelFormat } from '../types/wildlife';

/**
 * Download sources for on-device models.
 *
 * Hosting is the Ganesha backend's Blob Storage distribution (`GET
 * /models/{model_name}/latest`, see `modelSourceResolver`), not a static
 * config entry — the backend returns a fresh short-lived read-SAS
 * `downloadUrl` plus the published `sha256`/`sizeBytes` on every call, so a
 * `ModelSource` is resolved dynamically per acquisition attempt rather than
 * hardcoded here. The real shipped model is FP32 MiewID v4.1
 * (`miewid_v4_1.onnx`, 204,011,297 bytes, sha256
 * `1ff7c7879bb9e6b1847d19e1905e80f4e960aeed645dce9a52b9aaded2f0f763`) — no
 * FP16 export was ever built.
 */
export interface ModelSource {
  name: string;
  version: string;
  url: string;
  /** Lowercase hex SHA-256 of the artifact, no prefix. */
  expectedSha256: string;
  expectedSizeBytes?: number;
  /** Extra request headers (e.g. auth for a private HF repo). */
  headers?: Record<string, string>;
  /** Which runtime this artifact needs — see ModelFormat. */
  format: ModelFormat;
}

/** Model name key the backend's `/models/{model_name}/latest` endpoint expects. */
export const MIEWID_MODEL_NAME = 'miewid';

/**
 * Model name key for the LiteRT/GPU artifact of the same MiewID version
 * (WS7). Published 2026-09-06 to the model-artifacts blob container.
 */
export const MIEWID_LITERT_MODEL_NAME = 'miewid-litert';
