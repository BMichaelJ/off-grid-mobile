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

export type GaneshaApiErrorCode =
  | 'network-error'
  | 'unauthorized'
  | 'not-found'
  | 'http-error'
  | 'parse-error';

export type GaneshaApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GaneshaApiErrorCode; message: string; httpStatus?: number };
