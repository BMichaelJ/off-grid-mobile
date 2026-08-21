/**
 * Download sources for on-device models.
 *
 * Hosting for the published MiewID ONNX is not yet decided (HF repo, CXL
 * CDN, or GitHub release asset — integration plan open item #5), so the
 * download service is driven entirely by this config: fill in `url` and
 * `expectedSha256` once hosting lands and the download path lights up
 * without code changes.
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
}

// TODO(hosting): populate url + expectedSha256 when MiewID v4.1 FP16 hosting
// is decided. Local artifact: miewid_v4_1_fp16.onnx, 103,859,027 bytes.
export const MIEWID_MODEL_SOURCE: ModelSource = {
  name: 'miewid',
  version: '4.1.0',
  url: '',
  expectedSha256: '',
  expectedSizeBytes: 103_859_027,
};
