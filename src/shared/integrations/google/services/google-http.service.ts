import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';

import { HttpClientService, QueryValue } from '@shared/common/client';
import config from '../config';
import { GoogleApiError } from '../errors';

interface GoogleErrorDetail {
  metadata?: { quota_limit_value?: string };
}

interface GoogleErrorBody {
  error?: { message?: string; status?: string; details?: GoogleErrorDetail[] } | string;
  error_description?: string;
}

/**
 * Detecta la cuota en cero (proyecto sin el Basic API Access aprobado). Google lo informa en
 * `details[].metadata.quota_limit_value`; el texto del mensaje queda como respaldo.
 */
const hasZeroQuota = (body: GoogleErrorBody | undefined): boolean => {
  if (typeof body?.error !== 'object' || body.error === null) {
    return false;
  }

  const details = Array.isArray(body.error.details) ? body.error.details : [];
  if (details.some((detail) => detail?.metadata?.quota_limit_value === '0')) {
    return true;
  }

  return /\bvalue 0\b/.test(body.error.message ?? '');
};

/**
 * Cliente HTTP para las APIs de Google: agrega el bearer, normaliza errores y reintenta
 * con backoff exponencial mas jitter ante 429/5xx, como pide la documentacion de cuotas.
 */
@Injectable()
export class GoogleHttpService {
  private readonly logger = new Logger(GoogleHttpService.name);

  constructor(private readonly httpClient: HttpClientService) {}

  async get<T>(operation: string, url: string, accessToken: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.withRetry(operation, () =>
      this.httpClient.get<T>({ url, query, headers: this.authHeaders(accessToken) }),
    );
  }

  async put<T>(operation: string, url: string, accessToken: string, body: unknown): Promise<T> {
    return this.withRetry(operation, () =>
      this.httpClient.put<T>({ url, body, headers: this.authHeaders(accessToken) }),
    );
  }

  async delete<T>(operation: string, url: string, accessToken: string): Promise<T> {
    return this.withRetry(operation, () => this.httpClient.delete<T>({ url, headers: this.authHeaders(accessToken) }));
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }

  private async withRetry<T>(operation: string, call: () => Promise<T>): Promise<T> {
    let lastError: GoogleApiError | undefined;

    for (let attempt = 0; attempt <= config.Http.MaxRetries; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        lastError = this.normalize(error, operation);

        if (!lastError.isRetryable || attempt === config.Http.MaxRetries) {
          throw lastError;
        }

        const delay = config.Http.BaseBackoffMs * 2 ** attempt + Math.floor(Math.random() * config.Http.BaseBackoffMs);
        this.logger.warn(`${operation} failed with ${lastError.statusCode}, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new GoogleApiError(undefined, 'unknown', operation);
  }

  /** El mensaje de Google se guarda para el log, nunca se devuelve al cliente tal cual. */
  private normalize(error: unknown, operation: string): GoogleApiError {
    if (error instanceof GoogleApiError) {
      return error;
    }

    const axiosError = error as AxiosError<GoogleErrorBody>;
    if (axiosError?.isAxiosError) {
      const body = axiosError.response?.data;
      const reason =
        (typeof body?.error === 'object' ? body.error?.status || body.error?.message : body?.error) ??
        axiosError.message;

      // Solo se extrae el dato que hace falta: el cuerpo crudo no se guarda.
      return new GoogleApiError(axiosError.response?.status, reason, operation, hasZeroQuota(body));
    }

    return new GoogleApiError(undefined, error instanceof Error ? error.message : 'unknown error', operation);
  }
}
