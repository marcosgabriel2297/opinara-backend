import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';

const LIMIT = 3;

describe('Rate limit de la landing publica', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, close } = await createTestApp({ PUBLIC_THROTTLE_LIMIT: String(LIMIT), PUBLIC_THROTTLE_TTL: '60000' }));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  it('corta el scraping o el spam de feedback desde una misma IP', async () => {
    const attempt = () => request(app.getHttpServer()).get('/api/public/r/un-negocio/una-campania');

    const statuses: number[] = [];
    for (let i = 0; i < LIMIT + 2; i += 1) {
      statuses.push((await attempt()).status);
    }

    // Los primeros son 404 porque la campaña no existe; lo que importa es el corte.
    expect(statuses.slice(0, LIMIT)).toEqual(Array<number>(LIMIT).fill(404));
    expect(statuses.slice(LIMIT)).toEqual([429, 429]);
  });
});
