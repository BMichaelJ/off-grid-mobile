import { ganeshaApiClient } from '../../../src/services/ganeshaApiClient';
import { GANESHA_API_BASE_URL } from '../../../src/config/ganeshaApi';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe('ganeshaApiClient.getLatestModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed model info and authenticates with the dev-token header', async () => {
    const body = {
      name: 'miewid',
      version: '4.1.0',
      sha256: '1ff7c7879bb9e6b1847d19e1905e80f4e960aeed645dce9a52b9aaded2f0f763',
      sizeBytes: 204011297,
      downloadUrl: 'https://ganeshasfc2o4rujo76u.blob.core.windows.net/model-artifacts/miewid/4.1.0/miewid_v4_1.onnx?sig=x',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(200, body));

    const result = await ganeshaApiClient.getLatestModel('miewid');

    expect(result).toEqual({ ok: true, data: body });
    expect(mockFetch).toHaveBeenCalledWith(
      `${GANESHA_API_BASE_URL}/models/miewid/latest`,
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer dev-token' },
      }),
    );
  });

  it('URL-encodes the model name', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

    await ganeshaApiClient.getLatestModel('a model/with slash');

    expect(mockFetch).toHaveBeenCalledWith(
      `${GANESHA_API_BASE_URL}/models/a%20model%2Fwith%20slash/latest`,
      expect.anything(),
    );
  });

  it('maps a 404 to a not-found result', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { error: 'No published model found for this name' }));

    const result = await ganeshaApiClient.getLatestModel('nonexistent');

    expect(result).toEqual({ ok: false, code: 'not-found', message: 'HTTP 404', httpStatus: 404 });
  });

  it('maps a 401 to an unauthorized result', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }));

    const result = await ganeshaApiClient.getLatestModel('miewid');

    expect(result).toEqual({ ok: false, code: 'unauthorized', message: 'HTTP 401', httpStatus: 401 });
  });

  it('maps a 500 to an http-error result', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(500, { error: 'Internal error' }));

    const result = await ganeshaApiClient.getLatestModel('miewid');

    expect(result).toEqual({ ok: false, code: 'http-error', message: 'HTTP 500', httpStatus: 500 });
  });

  it('maps a network failure (fetch rejects) to a network-error result', async () => {
    mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

    const result = await ganeshaApiClient.getLatestModel('miewid');

    expect(result).toEqual({ ok: false, code: 'network-error', message: 'getaddrinfo ENOTFOUND' });
  });

  it('maps malformed JSON to a parse-error result', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () => Promise.reject(new Error('Unexpected token')),
    } as unknown as Response);

    const result = await ganeshaApiClient.getLatestModel('miewid');

    expect(result).toEqual({ ok: false, code: 'parse-error', message: 'Unexpected token' });
  });
});

describe('ganeshaApiClient.getLatestPack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed pack info from the project-scoped endpoint', async () => {
    const body = {
      projectId: 'proj_kariega',
      displayName: 'Kariega Elephants',
      version: '2026-08-22T12:38:40Z',
      sha256: 'ebed1d341b58034de6108a5b138373aa64a7e8458bc43e43909ad0850bf660ba',
      sizeBytes: 20684583,
      individualCount: 3,
      embeddingCount: 141,
      downloadUrl: 'https://ganeshasfc2o4rujo76u.blob.core.windows.net/wildlife-packs/proj_kariega/wildbook-pack-kariega.zip?sig=x',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(200, body));

    const result = await ganeshaApiClient.getLatestPack('proj_kariega');

    expect(result).toEqual({ ok: true, data: body });
    expect(mockFetch).toHaveBeenCalledWith(
      `${GANESHA_API_BASE_URL}/projects/proj_kariega/packs/latest`,
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer dev-token' },
      }),
    );
  });

  it('maps a 403 (forbidden project access) to an unauthorized result', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(403, { error: 'Forbidden' }));

    const result = await ganeshaApiClient.getLatestPack('proj_other');

    expect(result).toEqual({ ok: false, code: 'unauthorized', message: 'HTTP 403', httpStatus: 403 });
  });

  it('maps a 404 (no published pack) to a not-found result', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { error: 'No published pack found for this project' }));

    const result = await ganeshaApiClient.getLatestPack('proj_kariega');

    expect(result).toEqual({ ok: false, code: 'not-found', message: 'HTTP 404', httpStatus: 404 });
  });
});
