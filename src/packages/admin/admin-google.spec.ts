import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { TEST_PASSWORD, createAdmin, createBusiness, registerUser } from '../../../test/helpers';

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

const COLLECTIONS = [
  'users',
  'admins',
  'sessions',
  'businesses',
  'business_members',
  'locations',
  'google_connections',
];

describe('Salud de Google y detalle de usuario (integracion)', () => {
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
  });

  afterEach(async () => {
    await Promise.all(COLLECTIONS.map((name) => connection.collection(name).deleteMany({})));
  });

  const get = (path: string, auth = adminAuth) => request(app.getHttpServer()).get(path).set('Authorization', auth);

  describe('salud de la integración con Google', () => {
    beforeEach(async () => {
      const business = (urn: string, name: string, status = 'ACTIVE') => ({
        urn,
        name,
        slug: urn.split(':')[2],
        ownerUserUrn: 'urn:user:x',
        status,
      });
      await connection
        .collection('businesses')
        .insertMany([
          business('urn:business:cafe', 'Café'),
          business('urn:business:pelu', 'Peluquería'),
          business('urn:business:bar', 'Bar'),
          business('urn:business:kiosco', 'Kiosco'),
          business('urn:business:libreria', 'Librería'),
          business('urn:business:suspendido', 'Suspendido', 'SUSPENDED'),
        ]);
      const conn = (businessUrn: string, status: string, extra = {}) => ({
        urn: `urn:google-connection:${businessUrn}`,
        businessUrn,
        status,
        refreshToken: { ciphertext: 'secreto', iv: 'x', tag: 'y', keyVersion: 1 },
        connectedAt: ago(1000),
        ...extra,
      });
      await connection
        .collection('google_connections')
        .insertMany([
          conn('urn:business:cafe', 'ACTIVE'),
          conn('urn:business:pelu', 'REVOKED', { revokedAt: ago(48) }),
          conn('urn:business:bar', 'DISCONNECTED'),
          conn('urn:business:kiosco', 'ACTIVE'),
          conn('urn:business:suspendido', 'REVOKED'),
        ]);
      let id = 0;
      const location = (businessUrn: string, title: string, source: string, lastReviewSyncAt?: Date) => {
        id += 1;
        return {
          urn: `urn:location:${String(id)}`,
          businessUrn,
          title,
          source,
          isActive: true,
          googleLocationName: `locations/${String(id)}`,
          ...(lastReviewSyncAt ? { lastReviewSyncAt } : {}),
        };
      };
      await connection
        .collection('locations')
        .insertMany([
          location('urn:business:cafe', 'Centro', 'GOOGLE', ago(0.25)),
          location('urn:business:cafe', 'Palermo', 'GOOGLE', ago(10)),
          location('urn:business:cafe', 'Belgrano', 'GOOGLE'),
          location('urn:business:kiosco', 'Kiosco', 'MANUAL'),
          location('urn:business:libreria', 'Librería', 'MANUAL'),
        ]);
    });

    it('cuenta conexiones y sucursales, y lista los problemas, lo más urgente primero', async () => {
      const { body } = await get('/api/admin/google/health').expect(200);

      expect(body).toMatchObject({
        staleAfterHours: 6,
        businesses: { connected: 2, revoked: 1, disconnected: 1, neverConnected: 1 },
        locations: { google: 3, stale: 2, manual: 2 },
      });
      expect(typeof body.syncEnabled).toBe('boolean');
      expect(
        body.issues.map((issue: { kind: string; business: { name: string } }) => [issue.kind, issue.business.name]),
      ).toEqual([
        ['CONNECTION_REVOKED', 'Peluquería'],
        ['STALE_LOCATIONS', 'Café'],
        ['NO_GOOGLE_LOCATIONS', 'Kiosco'],
        ['CONNECTION_DISCONNECTED', 'Bar'],
      ]);

      const cafe = body.issues[1];
      expect(cafe.staleLocations.map((location: { title: string }) => location.title)).toEqual(['Belgrano', 'Palermo']);
      expect(new Date(cafe.lastSyncAt).getTime()).toBeGreaterThan(ago(1).getTime());
      expect(body.issues[0].connection.revokedAt).not.toBeNull();
      expect(JSON.stringify(body)).not.toContain('secreto');
    });

    it('el detalle del negocio toma la última sincronización de sus sucursales', async () => {
      const { body } = await get('/api/admin/businesses/urn:business:cafe').expect(200);

      expect(new Date(body.google.lastSyncAt).getTime()).toBeGreaterThan(ago(1).getTime());
    });

    it('solo con el token de un admin', async () => {
      const user = await registerUser(app);
      await request(app.getHttpServer()).get('/api/admin/google/health').expect(401);
      await get('/api/admin/google/health', user.auth).expect(401);
    });
  });

  describe('detalle de un usuario', () => {
    it('trae sus negocios con rol y estado, y sus sesiones', async () => {
      const user = await registerUser(app, 'dueno@opinara.test');
      const business = await createBusiness(app, user, { name: 'Café de la Esquina' });
      // Un segundo inicio de sesión, y después cierra ese.
      const second = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: second.body.refreshToken })
        .expect(204);

      const { body } = await get(`/api/admin/users/${encodeURIComponent(user.urn)}`).expect(200);

      expect(body).toMatchObject({
        urn: user.urn,
        email: 'dueno@opinara.test',
        status: 'ACTIVE',
        businesses: [{ urn: business.urn, name: 'Café de la Esquina', role: 'OWNER', status: 'ACTIVE' }],
        sessions: { active: 1 },
      });
      expect(new Date(body.sessions.lastLoginAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(body.sessions.lastSeenAt).not.toBeNull();
      expect(body).not.toHaveProperty('password');
    });

    it('sin sesiones, las fechas vienen vacías; un usuario inexistente es 404', async () => {
      await connection.collection('users').insertOne({
        urn: 'urn:user:nunca-entro',
        email: 'nunca@opinara.test',
        name: 'Nunca',
        password: 'x',
        status: 'ACTIVE',
        mustChangePassword: true,
      });

      const { body } = await get('/api/admin/users/urn:user:nunca-entro').expect(200);
      expect(body.sessions).toEqual({ active: 0, lastLoginAt: null, lastSeenAt: null });
      expect(body.businesses).toEqual([]);

      const missing = await get('/api/admin/users/urn:user:no-existe').expect(404);
      expect(missing.body.errorCode).toBe('USER_NOT_FOUND');
    });
  });
});
