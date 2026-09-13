import { createServer, Server } from 'http';
import { AddressInfo } from 'net';

import { HttpModule } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { HttpClientService } from './client.service';

interface EchoResponse {
  received: unknown;
  access_token: string;
}

describe('HttpClientService', () => {
  let server: Server;
  let baseUrl: string;
  let service: HttpClientService;
  let logs: string[];

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ received: body === '' ? null : JSON.parse(body), access_token: 'ya29.leaked' }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const moduleRef = await Test.createTestingModule({
      imports: [HttpModule.register({ timeout: 5000 })],
      providers: [HttpClientService],
    }).compile();

    service = moduleRef.get(HttpClientService);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    logs = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('devuelve el body tipado de la respuesta', async () => {
    const result = await service.post<EchoResponse>({ url: `${baseUrl}/echo`, body: { hello: 'world' } });

    expect(result.received).toEqual({ hello: 'world' });
  });

  it('no loguea tokens del request ni headers de autorizacion', async () => {
    await service.post<EchoResponse>({
      url: `${baseUrl}/echo`,
      headers: { Authorization: 'Bearer ya29.super-secret' },
      body: { refresh_token: '1//0secret', comment: 'gracias por la reseña' },
    });

    const output = logs.join('\n');

    expect(output).toContain('[REDACTED]');
    expect(output).toContain('gracias por la reseña');
    expect(output).not.toContain('1//0secret');
    expect(output).not.toContain('ya29.super-secret');
  });

  it('con sensitive:true no loguea nada del payload', async () => {
    await service.post<EchoResponse>({
      url: `${baseUrl}/token`,
      body: { code: 'auth-code', client_secret: 'shhh' },
      sensitive: true,
    });

    const output = logs.join('\n');

    expect(output).toContain('[SENSITIVE]');
    expect(output).not.toContain('auth-code');
    expect(output).not.toContain('shhh');
  });

  it('nunca loguea el cuerpo de la respuesta', async () => {
    await service.get<EchoResponse>({ url: `${baseUrl}/echo` });

    expect(logs.join('\n')).not.toContain('ya29.leaked');
    expect(logs.join('\n')).toContain('-> 200');
  });
});
