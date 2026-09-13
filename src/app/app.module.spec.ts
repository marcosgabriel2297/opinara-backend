import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp } from '../../test/app.factory';

describe('AppModule (smoke)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
  }, 120000);

  afterAll(async () => {
    await close();
  });

  it('responde el health check con la base conectada', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('devuelve 404 con el formato de error estandar', async () => {
    const response = await request(app.getHttpServer()).get('/api/no-existe').expect(404);

    expect(response.body).toMatchObject({ statusCode: 404, path: '/api/no-existe', errorCode: 'NOT_FOUND' });
    expect(response.body).not.toHaveProperty('stack');
  });
});
