import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';

const LIMIT = 3;

describe('Rate limit del QR publico', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, close } = await createTestApp({
      PUBLIC_THROTTLE_LIMIT: String(LIMIT),
      PUBLIC_THROTTLE_TTL: '60000',
      PUBLIC_APP_BASE_URL: 'https://app.opinara.test',
    }));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  const scan = (path: string) => request(app.getHttpServer()).get(`/api/public/r/${path}`);

  it('pasado el limite redirige a una pagina que reintenta sola, nunca un JSON en el telefono', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LIMIT; i += 1) {
      statuses.push((await scan('un-negocio/una-campania')).status);
    }
    // Los primeros redirigen a "no disponible" porque la campaña no existe; lo que importa es el corte.
    expect(statuses).toEqual(Array<number>(LIMIT).fill(302));

    const throttled = await scan('un-negocio/una-campania').expect(302);
    expect(throttled.headers.location).toBe('https://app.opinara.test/r/un-negocio/una-campania/espera');
    expect(throttled.headers['cache-control']).toBe('no-store');
    expect(throttled.headers['content-type'] ?? '').not.toContain('application/json');
  });

  it('cuenta por campaña: el limite de un QR no corta a otro desde la misma IP', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      await scan('otro-negocio/mostrador').expect(302);
    }
    const blocked = await scan('otro-negocio/mostrador').expect(302);
    expect(blocked.headers.location).toContain('/espera');

    const other = await scan('otro-negocio/mesas').expect(302);
    expect(other.headers.location).toBe('https://app.opinara.test/r/no-disponible');
  });

  it('con slugs sin formato valido, a "no disponible" (no arma una URL con lo que mando el cliente)', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      await scan('Raro%20Slug/X').expect((response) => expect([302, 400]).toContain(response.status));
    }
    const response = await scan('Raro%20Slug/X').expect(302);
    expect(response.headers.location).toBe('https://app.opinara.test/r/no-disponible');
  });
});
