import { AxiosError } from 'axios';

import { HttpClientService } from '@shared/common/client';
import { GoogleApiError } from '../errors';
import { GoogleHttpService } from './google-http.service';

const axiosErrorWith = (status: number, body: unknown): AxiosError =>
  ({ isAxiosError: true, message: 'Request failed', response: { status, data: body } }) as AxiosError;

const buildService = (get: jest.Mock) => {
  const httpClient = { get, post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return new GoogleHttpService(httpClient as unknown as HttpClientService);
};

describe('GoogleHttpService', () => {
  beforeEach(() => {
    // Los backoff reales harian lento el test; se salta la espera manteniendo la logica.
    jest.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => jest.restoreAllMocks());

  it('devuelve el body y manda el bearer del access token', async () => {
    const get = jest.fn().mockResolvedValue({ accounts: [] });
    const service = buildService(get);

    await expect(service.get('accounts.list', 'https://api.test/accounts', 'ya29.token')).resolves.toEqual({
      accounts: [],
    });
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ headers: { Authorization: 'Bearer ya29.token' } }));
  });

  it('reintenta ante 429 y termina devolviendo el resultado', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(axiosErrorWith(429, { error: { status: 'RESOURCE_EXHAUSTED' } }))
      .mockRejectedValueOnce(axiosErrorWith(503, { error: { status: 'UNAVAILABLE' } }))
      .mockResolvedValue({ accounts: [{ name: 'accounts/1' }] });

    await expect(buildService(get).get('accounts.list', 'https://api.test/accounts', 'token')).resolves.toEqual({
      accounts: [{ name: 'accounts/1' }],
    });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('no reintenta errores del cliente: un 404 falla en el primer intento', async () => {
    const get = jest.fn().mockRejectedValue(axiosErrorWith(404, { error: { status: 'NOT_FOUND' } }));

    await expect(buildService(get).get('locations.list', 'https://api.test/locations', 'token')).rejects.toMatchObject({
      statusCode: 404,
      reason: 'NOT_FOUND',
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('se rinde despues del maximo de reintentos', async () => {
    const get = jest.fn().mockRejectedValue(axiosErrorWith(500, { error: { status: 'INTERNAL' } }));

    const error = await buildService(get)
      .get('accounts.list', 'https://api.test/accounts', 'token')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GoogleApiError);
    // Intento inicial + 3 reintentos configurados por defecto.
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('clasifica correctamente los errores de autenticacion', () => {
    expect(new GoogleApiError(401, 'UNAUTHENTICATED', 'op').isAuthFailure).toBe(true);
    expect(new GoogleApiError(400, 'invalid_grant', 'op').isAuthFailure).toBe(true);
    expect(new GoogleApiError(403, 'PERMISSION_DENIED', 'op').isAuthFailure).toBe(false);
    expect(new GoogleApiError(429, 'RESOURCE_EXHAUSTED', 'op').isRetryable).toBe(true);
    expect(new GoogleApiError(404, 'NOT_FOUND', 'op').isRetryable).toBe(false);
  });
});
