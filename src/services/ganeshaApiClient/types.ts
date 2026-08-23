export interface LatestModelInfo {
  name: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  downloadUrl: string;
}

export interface LatestPackInfo {
  projectId: string;
  displayName: string | null;
  version: string;
  sha256: string;
  sizeBytes: number;
  individualCount: number | null;
  embeddingCount: number | null;
  downloadUrl: string;
}

export interface UploadUrlInfo {
  uploadUrl: string;
  blobUrl: string;
}

/**
 * Body for `POST /projects/{project_id}/submissions` (backend/function_app.py
 * `SubmitFieldObservationRequest`). `imageUrl` must already point at an
 * uploaded blob (see `getUploadUrl` + a direct PUT to its `uploadUrl`) --
 * this endpoint does not accept raw image bytes itself.
 */
export interface SubmitObservationPayload {
  imageUrl: string;
  elephantId: string;
  elephantName?: string | null;
  confidence?: number | null;
  alternatives?: unknown[] | null;
  lat?: number | null;
  long?: number | null;
  regionName?: string;
  observationDate?: string | null;
  observationNotes?: string | null;
  captureTimestamp?: string | null;
  deviceModel?: string | null;
  deviceOs?: string | null;
}

export interface SubmitObservationResult {
  submissionId: string;
  status: string;
  imageUrl: string | null;
}

export type GaneshaApiErrorCode =
  | 'network-error'
  | 'unauthorized'
  | 'not-found'
  | 'http-error'
  | 'parse-error';

export type GaneshaApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GaneshaApiErrorCode; message: string; httpStatus?: number };
