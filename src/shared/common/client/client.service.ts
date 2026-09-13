import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

import { redactToString } from '@shared/utils';

export type QueryValue = string | number | boolean | string[] | undefined;

export interface HttpRequest {
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Si es true no se loguea el body ni la query (ej: intercambio de tokens OAuth). */
  sensitive?: boolean;
}

/**
 * Wrapper fino sobre axios para las integraciones externas.
 * A diferencia de un logger ingenuo, nunca loguea headers (Authorization) ni respuestas
 * completas, y redacta los campos sensibles del request.
 */
@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);

  constructor(private readonly httpService: HttpService) {}

  get<T>(request: HttpRequest): Promise<T> {
    return this.request<T>('GET', request);
  }

  post<T>(request: HttpRequest): Promise<T> {
    return this.request<T>('POST', request);
  }

  put<T>(request: HttpRequest): Promise<T> {
    return this.request<T>('PUT', request);
  }

  patch<T>(request: HttpRequest): Promise<T> {
    return this.request<T>('PATCH', request);
  }

  delete<T>(request: HttpRequest): Promise<T> {
    return this.request<T>('DELETE', request);
  }

  private async request<T>(method: string, request: HttpRequest): Promise<T> {
    const { url, headers = {}, query, body, sensitive = false } = request;
    const config: AxiosRequestConfig = { headers, params: query, method, url, data: body };

    this.logger.log(`${method} ${url} ${sensitive ? '[SENSITIVE]' : redactToString({ query, body })}`);

    const startedAt = Date.now();
    const response = await firstValueFrom(this.httpService.request<T>(config));

    this.logger.log(`${method} ${url} -> ${response.status} in ${Date.now() - startedAt}ms`);

    return response.data;
  }
}
