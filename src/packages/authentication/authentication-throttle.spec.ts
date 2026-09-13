import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';

const LIMIT = 3;

describe('Authentication rate limiting', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, close } = await createTestApp({ AUTH_THROTTLE_LIMIT: String(LIMIT), AUTH_THROTTLE_TTL: '60000' }));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  it('corta los intentos de login por fuerza bruta', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/api/auth/login').send({ email: 'a@b.test', password: 'claveIncorrecta1' });

    const statuses: number[] = [];
    for (let i = 0; i < LIMIT + 2; i += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses.slice(0, LIMIT)).toEqual(Array<number>(LIMIT).fill(401));
    expect(statuses.slice(LIMIT)).toEqual([429, 429]);

    const blocked = await attempt();
    expect(blocked.body.errorCode).toBe('TOO_MANY_REQUESTS');
  });
});
