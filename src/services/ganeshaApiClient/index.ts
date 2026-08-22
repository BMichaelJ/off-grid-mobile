import { GANESHA_API_BASE_URL, GANESHA_API_DEV_TOKEN } from '../../config/ganeshaApi';
import type { GaneshaApiErrorCode, GaneshaApiResult, LatestModelInfo, LatestPackInfo } from './types';
import logger from '../../utils/logger';

/**
 * Thin client for the Ganesha backend's model/pack distribution endpoints
 * (backend/function_app.py: GET /models/{model_name}/latest,
 * GET /projects/{project_id}/packs/latest). Every call returns a typed
 * ok/err result rather than throwing, matching modelDownloadService's
 * DownloadOutcome convention -- callers branch on `.ok`, never try/catch.
 *
 * Auth is the `dev-token` bearer shortcut until mobile-entra-auth (MSAL)
 * lands; the header injection point is centralized here so swapping in a
 * real Entra ID token later is a one-line change in getJson(), not a
 * per-call-site change.
 */
class GaneshaApiClient {
  async getLatestModel(modelName: string): Promise<GaneshaApiResult<LatestModelInfo>> {
    return this.getJson<LatestModelInfo>(`/models/${encodeURIComponent(modelName)}/latest`);
  }

  async getLatestPack(projectId: string): Promise<GaneshaApiResult<LatestPackInfo>> {
    return this.getJson<LatestPackInfo>(
      `/projects/${encodeURIComponent(projectId)}/packs/latest`,
    );
  }

  private async getJson<T>(path: string): Promise<GaneshaApiResult<T>> {
    let response: Response;
    try {
      response = await fetch(`${GANESHA_API_BASE_URL}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${GANESHA_API_DEV_TOKEN}` },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[GaneshaApiClient] Network error for ${path}: ${message}`);
      return { ok: false, code: 'network-error', message };
    }

    const errorCode = this.errorCodeFor(response.status);
    if (errorCode) {
      logger.warn(`[GaneshaApiClient] ${path} returned HTTP ${response.status}`);
      return { ok: false, code: errorCode, message: `HTTP ${response.status}`, httpStatus: response.status };
    }

    try {
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[GaneshaApiClient] Malformed JSON from ${path}: ${message}`);
      return { ok: false, code: 'parse-error', message };
    }
  }

  private errorCodeFor(status: number): GaneshaApiErrorCode | null {
    if (status === 401 || status === 403) {
      return 'unauthorized';
    }
    if (status === 404) {
      return 'not-found';
    }
    if (status < 200 || status >= 300) {
      return 'http-error';
    }
    return null;
  }
}

export const ganeshaApiClient = new GaneshaApiClient();
export type {
  LatestModelInfo,
  LatestPackInfo,
  GaneshaApiResult,
  GaneshaApiErrorCode,
} from './types';
