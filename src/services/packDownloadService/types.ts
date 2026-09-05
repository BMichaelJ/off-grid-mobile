import type { GaneshaApiErrorCode } from '../ganeshaApiClient';
import type { DownloadErrorCode } from '../fileDownloadService';
import type { EmbeddingPack } from '../../types';

export type PackAcquisitionErrorCode =
  | GaneshaApiErrorCode
  | DownloadErrorCode
  | 'unzip-failed'
  | 'validation-failed'
  | 'model-incompatible'
  | 'metadata-invalid'
  | 'filesystem-error'
  | 'activation-failed'
  | 'unexpected-error';

export type PackAcquisitionOutcome =
  | { ok: true; pack: EmbeddingPack }
  | {
      ok: false;
      code: PackAcquisitionErrorCode;
      message: string;
      httpStatus?: number;
    };
