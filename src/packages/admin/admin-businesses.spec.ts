import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { createAdmin, registerUser } from '../../../test/helpers';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

const CAFE = 'urn:business:aaaaaaaa-0000-4000-8000-000000000001';
const PELU = 'urn:business:aaaaaaaa-0000-4000-8000-000000000002';
const CENTRO = 'urn:location:bbbbbbbb-0000-4000-8000-000000000001';
const PALERMO = 'urn:location:bbbbbbbb-0000-4000-8000-000000000002';
const ESTILO = 'urn:location:bbbbbbbb-0000-4000-8000-000000000003';
const MOSTRADOR = 'urn:campaign:cccccccc-0000-4000-8000-000000000001';
const MESAS = 'urn:campaign:cccccccc-0000-4000-8000-000000000002';
const SILLON = 'urn:campaign:cccccccc-0000-4000-8000-000000000003';

const COLLECTIONS = [
  'users',
  'admins',
  'sessions',
  'businesses',
  'business_members',
  'locations',
  'campaigns',
  'reviews',
  'scan_events',
  'google_connections',
];

describe('Negocios y escaneos en el panel del admin (integracion)', () => {
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
    const lucia = await registerUser(app, 'lucia@opinara.test');
    const martin = await registerUser(app, 'martin@opinara.test');
    const diego = await registerUser(app, 'diego@opinara.test');

    await connection.collection('businesses').insertMany([
      {
        urn: CAFE,
        name: 'Café de la Esquina',
        slug: 'cafe',
        ownerUserUrn: lucia.urn,
        status: 'ACTIVE',
        createdAt: ago(100),
      },
      {
        urn: PELU,
        name: 'Peluquería Estilo',
        slug: 'pelu',
        ownerUserUrn: diego.urn,
        status: 'SUSPENDED',
        createdAt: ago(10),
      },
    ]);
    await connection.collection('business_members').insertMany([
      { urn: 'urn:business-member:1', businessUrn: CAFE, userUrn: lucia.urn, role: 'OWNER', status: 'ACTIVE' },
      { urn: 'urn:business-member:2', businessUrn: CAFE, userUrn: martin.urn, role: 'MEMBER', status: 'ACTIVE' },
      { urn: 'urn:business-member:3', businessUrn: PELU, userUrn: diego.urn, role: 'OWNER', status: 'ACTIVE' },
      { urn: 'urn:business-member:4', businessUrn: PELU, userUrn: martin.urn, role: 'ADMIN', status: 'REVOKED' },
    ]);
    await connection.collection('google_connections').insertMany([
      {
        urn: 'urn:google-connection:1',
        businessUrn: CAFE,
        status: 'ACTIVE',
        refreshToken: { ciphertext: 'secreto', iv: 'x', tag: 'y', keyVersion: 1 },
        connectedAt: ago(90),
      },
    ]);
    await connection.collection('locations').insertMany([
      {
        urn: CENTRO,
        businessUrn: CAFE,
        title: 'Centro',
        googleLocationName: 'locations/1',
        source: 'GOOGLE',
        isActive: true,
      },
      {
        urn: PALERMO,
        businessUrn: CAFE,
        title: 'Palermo',
        googleLocationName: 'locations/2',
        source: 'MANUAL',
        isActive: true,
      },
      {
        urn: ESTILO,
        businessUrn: PELU,
        title: 'Estilo',
        googleLocationName: 'locations/3',
        source: 'MANUAL',
        isActive: true,
      },
    ]);
    await connection.collection('campaigns').insertMany([
      {
        urn: MOSTRADOR,
        businessUrn: CAFE,
        locationUrn: CENTRO,
        name: 'Mostrador',
        slug: 'mostrador',
        status: 'ACTIVE',
        stats: { scans: 30 },
      },
      {
        urn: MESAS,
        businessUrn: CAFE,
        locationUrn: PALERMO,
        name: 'Mesas',
        slug: 'mesas',
        status: 'PAUSED',
        stats: { scans: 8 },
      },
      {
        urn: SILLON,
        businessUrn: PELU,
        locationUrn: ESTILO,
        name: 'Sillón',
        slug: 'sillon',
        status: 'ACTIVE',
        stats: { scans: 2 },
      },
    ]);
    const review = (id: number, businessUrn: string, locationUrn: string, starRating: number, extra = {}) => ({
      urn: `urn:review:${String(id)}`,
      businessUrn,
      locationUrn,
      googleReviewId: `g-${String(id)}`,
      starRating,
      googleCreateTime: ago(id),
      ...extra,
    });
    await connection
      .collection('reviews')
      .insertMany([
        review(1, CAFE, CENTRO, 5, { reply: { comment: 'Gracias' } }),
        review(2, CAFE, CENTRO, 3),
        review(3, CAFE, PALERMO, 4),
        review(4, PELU, ESTILO, 1),
      ]);
    const scan = (campaignUrn: string, businessUrn: string, days: number) => ({
      businessUrn,
      campaignUrn,
      scannedAt: ago(days),
    });
    await connection.collection('scan_events').insertMany([
      scan(MOSTRADOR, CAFE, 0),
      scan(MOSTRADOR, CAFE, 1),
      scan(MOSTRADOR, CAFE, 40),
      scan(MESAS, CAFE, 2),
      scan(SILLON, PELU, 3),
      scan(SILLON, PELU, 3),
      scan(SILLON, PELU, 3),
      // Fuera de 12 semanas.
      scan(MESAS, CAFE, 120),
    ]);
  });

  afterEach(async () => {
    await Promise.all(COLLECTIONS.map((name) => connection.collection(name).deleteMany({})));
  });

  const get = (path: string, auth = adminAuth) => request(app.getHttpServer()).get(path).set('Authorization', auth);

  describe('listado de negocios', () => {
    it('lista el más nuevo primero, con dueño, equipo, sucursales, Google, reseñas, campañas y escaneos', async () => {
      const { body } = await get('/api/admin/businesses').expect(200);

      expect(body).toMatchObject({ page: 0, limit: 25, total: 2 });
      expect(body.items.map((item: { name: string }) => item.name)).toEqual([
        'Peluquería Estilo',
        'Café de la Esquina',
      ]);
      expect(body.items[1]).toMatchObject({
        urn: CAFE,
        status: 'ACTIVE',
        owner: { email: 'lucia@opinara.test' },
        members: 2,
        locations: 2,
        google: { status: 'ACTIVE' },
        reviews: { total: 3, unanswered: 2, averageRating: 4 },
        campaigns: { total: 2, active: 1 },
        scans: 38,
      });
      // Una membresía revocada no cuenta; sin conexión de Google, `null`.
      expect(body.items[0]).toMatchObject({ members: 1, google: null, status: 'SUSPENDED' });
      // Nunca salen los tokens de Google.
      expect(JSON.stringify(body)).not.toContain('secreto');
    });

    it('filtra por texto, estado y Google, ordena por nombre y pagina', async () => {
      const names = async (query: string) =>
        ((await get(`/api/admin/businesses${query}`).expect(200)).body.items as { name: string }[]).map(
          (item) => item.name,
        );

      expect(await names('?search=PELU')).toEqual(['Peluquería Estilo']);
      expect(await names('?search=.*')).toEqual([]);
      expect(await names('?status=SUSPENDED')).toEqual(['Peluquería Estilo']);
      expect(await names('?google=connected')).toEqual(['Café de la Esquina']);
      expect(await names('?google=not_connected')).toEqual(['Peluquería Estilo']);
      expect(await names('?order=name')).toEqual(['Café de la Esquina', 'Peluquería Estilo']);
      expect(await names('?order=name&limit=1&page=1')).toEqual(['Peluquería Estilo']);
      await get('/api/admin/businesses?status=BORRADO').expect(400);
    });
  });

  describe('detalle de un negocio', () => {
    it('trae el equipo, las sucursales con sus reseñas y las campañas con sus escaneos', async () => {
      const { body } = await get(`/api/admin/businesses/${encodeURIComponent(CAFE)}`).expect(200);

      expect(body).toMatchObject({
        name: 'Café de la Esquina',
        owner: { email: 'lucia@opinara.test' },
        google: { status: 'ACTIVE' },
        reviews: { total: 3 },
        scans: 38,
      });
      expect(body.members.map((member: { email: string; role: string }) => [member.email, member.role])).toEqual([
        ['lucia@opinara.test', 'OWNER'],
        ['martin@opinara.test', 'MEMBER'],
      ]);
      expect(body.locations).toEqual([
        expect.objectContaining({
          title: 'Centro',
          source: 'GOOGLE',
          campaigns: 1,
          reviews: { total: 2, unanswered: 1, averageRating: 4 },
        }),
        expect.objectContaining({
          title: 'Palermo',
          source: 'MANUAL',
          campaigns: 1,
          reviews: { total: 1, unanswered: 1, averageRating: 4 },
        }),
      ]);
      expect(body.campaigns).toEqual([
        expect.objectContaining({
          name: 'Mostrador',
          scans: 30,
          scansLast30Days: 2,
          location: { urn: CENTRO, title: 'Centro' },
        }),
        expect.objectContaining({ name: 'Mesas', status: 'PAUSED', scans: 8, scansLast30Days: 1 }),
      ]);
      expect(JSON.stringify(body)).not.toContain('secreto');
    });

    it('un negocio inexistente es 404', async () => {
      const response = await get('/api/admin/businesses/urn:business:no-existe').expect(404);
      expect(response.body.errorCode).toBe('BUSINESS_NOT_FOUND');
    });
  });

  describe('escaneos', () => {
    it('da las semanas, los totales y el ranking de campañas de toda la plataforma', async () => {
      const { body } = await get('/api/admin/scans').expect(200);

      expect(body.weeks).toHaveLength(12);
      expect(body).toMatchObject({
        scansInPeriod: 7,
        scansTotal: 40,
        campaigns: { total: 3, active: 2, withoutScansInPeriod: 0 },
      });
      expect(body.ranking.map((row: { name: string; scansInPeriod: number }) => [row.name, row.scansInPeriod])).toEqual(
        [
          ['Mostrador', 3],
          ['Sillón', 3],
          ['Mesas', 1],
        ],
      );
      expect(body.ranking[0]).toMatchObject({
        business: { name: 'Café de la Esquina' },
        location: { title: 'Centro' },
        scansTotal: 30,
      });
      expect(new Date(body.trackedSince).getTime()).toBeLessThan(ago(119).getTime());
    });

    it('filtra por negocio y por sucursal, y acepta otro período', async () => {
      const cafe = (await get(`/api/admin/scans?businessUrn=${encodeURIComponent(CAFE)}`).expect(200)).body;
      expect(cafe).toMatchObject({ scansInPeriod: 4, scansTotal: 38, campaigns: { total: 2 } });

      const palermo = (await get(`/api/admin/scans?locationUrn=${encodeURIComponent(PALERMO)}`).expect(200)).body;
      expect(palermo).toMatchObject({ scansInPeriod: 1, scansTotal: 8 });
      expect(palermo.ranking.map((row: { name: string }) => row.name)).toEqual(['Mesas']);

      const month = (await get('/api/admin/scans?weeks=4').expect(200)).body;
      expect(month.weeks).toHaveLength(4);
      // El de hace 40 días queda afuera.
      expect(month.ranking.find((row: { name: string }) => row.name === 'Mostrador').scansInPeriod).toBe(2);
      await get('/api/admin/scans?weeks=0').expect(400);
    });
  });

  it('todo solo con el token del admin', async () => {
    const user = await registerUser(app, 'otro@opinara.test');

    for (const path of [
      '/api/admin/businesses',
      `/api/admin/businesses/${encodeURIComponent(CAFE)}`,
      '/api/admin/scans',
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
      await get(path, user.auth).expect(401);
    }
  });
});
