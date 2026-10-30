import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { createAdmin, registerUser } from '../../../test/helpers';

const CAFE = 'urn:business:aaaaaaaa-0000-4000-8000-000000000001';
const PELU = 'urn:business:aaaaaaaa-0000-4000-8000-000000000002';
const CENTRO = 'urn:location:bbbbbbbb-0000-4000-8000-000000000001';
const PALERMO = 'urn:location:bbbbbbbb-0000-4000-8000-000000000002';
const ESTILO = 'urn:location:bbbbbbbb-0000-4000-8000-000000000003';

let sequence = 0;
const review = (
  businessUrn: string,
  locationUrn: string,
  starRating: number,
  createdAt: string,
  extra: Record<string, unknown> = {},
) => {
  sequence += 1;
  return {
    urn: `urn:review:cccccccc-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    businessUrn,
    locationUrn,
    googleReviewId: `g-${sequence}`,
    googleReviewName: `accounts/1/locations/1/reviews/g-${sequence}`,
    starRating,
    starRatingRaw: String(starRating),
    reviewer: { displayName: `Cliente ${sequence}`, isAnonymous: false },
    googleCreateTime: new Date(createdAt),
    googleUpdateTime: new Date(createdAt),
    syncedAt: new Date(),
    ...extra,
  };
};

describe('Reportes del administrador (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let adminAuth: string;

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp());
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    adminAuth = await createAdmin(app);
    await connection.collection('businesses').insertMany([
      { urn: CAFE, name: 'Café de la Esquina', slug: 'cafe', ownerUserUrn: 'urn:user:x', status: 'ACTIVE' },
      { urn: PELU, name: 'Peluquería Estilo', slug: 'pelu', ownerUserUrn: 'urn:user:y', status: 'ACTIVE' },
    ]);
    await connection.collection('locations').insertMany([
      { urn: CENTRO, businessUrn: CAFE, title: 'Centro', googleLocationName: 'locations/1' },
      { urn: PALERMO, businessUrn: CAFE, title: 'Palermo', googleLocationName: 'locations/2' },
      { urn: ESTILO, businessUrn: PELU, title: 'Estilo', googleLocationName: 'locations/3' },
    ]);
    await connection
      .collection('reviews')
      .insertMany([
        review(CAFE, CENTRO, 5, '2026-10-01', { comment: 'El mejor café del barrio' }),
        review(CAFE, CENTRO, 2, '2026-10-05', { comment: 'Muy lento', reply: { comment: 'Perdón' } }),
        review(CAFE, PALERMO, 4, '2026-09-20'),
        review(PELU, ESTILO, 1, '2026-10-10', { comment: 'Me cortaron mal' }),
        review(PELU, ESTILO, 0, '2026-10-12'),
        review(PELU, ESTILO, 5, '2026-10-15', { deletedAt: new Date() }),
      ]);
  });

  afterEach(async () => {
    await Promise.all(
      ['users', 'admins', 'sessions', 'businesses', 'locations', 'reviews'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
  });

  const get = (path: string, auth = adminAuth) => request(app.getHttpServer()).get(path).set('Authorization', auth);

  it('lista las reseñas de todos los negocios, la mas nueva primero, con negocio y sucursal', async () => {
    const response = await get('/api/admin/reviews').expect(200);

    expect(response.body).toMatchObject({ page: 0, limit: 25, total: 5 });
    expect(response.body.items.map((item: { rating: number }) => item.rating)).toEqual([0, 1, 2, 5, 4]);
    expect(response.body.items[1]).toMatchObject({
      comment: 'Me cortaron mal',
      business: { urn: PELU, name: 'Peluquería Estilo' },
      location: { urn: ESTILO, title: 'Estilo' },
    });
    expect(JSON.stringify(response.body)).not.toContain('googleReviewName');
  });

  it('filtra por negocio, sucursal, estrellas, respuesta, fechas y texto', async () => {
    const total = async (query: string) => (await get(`/api/admin/reviews?${query}`).expect(200)).body.total;

    expect(await total(`businessUrn=${CAFE}`)).toBe(3);
    expect(await total(`locationUrn=${CENTRO}`)).toBe(2);
    expect(await total('rating=5')).toBe(1);
    expect(await total('hasReply=true')).toBe(1);
    expect(await total('hasReply=false')).toBe(4);
    expect(await total('from=2026-10-01&to=2026-10-11')).toBe(3);
    expect(await total('search=CAFÉ')).toBe(1);
    expect(await total('search=cliente')).toBe(5);
    // El texto se busca literal: no es una expresion regular.
    expect(await total('search=.*')).toBe(0);
  });

  it('pagina y ordena de la mas vieja a la mas nueva', async () => {
    const response = await get('/api/admin/reviews?limit=2&page=1&order=oldest').expect(200);

    expect(response.body).toMatchObject({ page: 1, limit: 2, total: 5 });
    expect(response.body.items.map((item: { rating: number }) => item.rating)).toEqual([2, 1]);
  });

  it('resume lo filtrado: total, sin responder, promedio sin las que no tienen estrellas y distribucion', async () => {
    const all = await get('/api/admin/reviews/summary').expect(200);
    expect(all.body).toEqual({
      total: 5,
      unanswered: 4,
      averageRating: 3,
      stars: { 1: 1, 2: 1, 3: 0, 4: 1, 5: 1 },
    });

    const pelu = await get(`/api/admin/reviews/summary?businessUrn=${PELU}`).expect(200);
    expect(pelu.body).toMatchObject({ total: 2, averageRating: 1 });

    const empty = await get('/api/admin/reviews/summary?rating=3').expect(200);
    expect(empty.body).toMatchObject({ total: 0, averageRating: null });
  });

  it('lista los negocios con sus sucursales para los filtros', async () => {
    const response = await get('/api/admin/businesses').expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        urn: CAFE,
        name: 'Café de la Esquina',
        locations: [
          { urn: CENTRO, title: 'Centro' },
          { urn: PALERMO, title: 'Palermo' },
        ],
      }),
      expect.objectContaining({ urn: PELU, locations: [{ urn: ESTILO, title: 'Estilo' }] }),
    ]);
  });

  it('solo con el token del admin', async () => {
    const user = await registerUser(app);

    for (const path of ['/api/admin/reviews', '/api/admin/reviews/summary', '/api/admin/businesses']) {
      await request(app.getHttpServer()).get(path).expect(401);
      await get(path, user.auth).expect(401);
    }
  });

  it('valida los filtros', async () => {
    await get('/api/admin/reviews?rating=6').expect(400);
    await get('/api/admin/reviews?limit=500').expect(400);
    await get('/api/admin/reviews?from=ayer').expect(400);
    await get('/api/admin/reviews?order=random').expect(400);
  });
});
