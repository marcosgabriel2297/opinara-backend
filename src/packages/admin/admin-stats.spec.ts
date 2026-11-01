import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { createAdmin, registerUser } from '../../../test/helpers';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe('Resumen de la plataforma (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp());
  }, 120000);

  afterAll(async () => {
    await close();
  });

  afterEach(async () => {
    await Promise.all(
      [
        'users',
        'admins',
        'sessions',
        'businesses',
        'locations',
        'campaigns',
        'reviews',
        'scan_events',
        'google_connections',
      ].map((name) => connection.collection(name).deleteMany({})),
    );
  });

  const overview = (auth: string, query = '') =>
    request(app.getHttpServer()).get(`/api/admin/stats/overview${query}`).set('Authorization', auth);

  const seed = async () => {
    const base = { ownerUserUrn: 'urn:user:x', timezone: 'America/Argentina/Buenos_Aires' };
    await connection.collection('users').insertMany([
      {
        urn: 'urn:user:a',
        email: 'a@x.test',
        name: 'A',
        status: 'ACTIVE',
        mustChangePassword: true,
        createdAt: new Date(),
      },
      {
        urn: 'urn:user:b',
        email: 'b@x.test',
        name: 'B',
        status: 'ACTIVE',
        mustChangePassword: false,
        createdAt: ago(7),
      },
      {
        urn: 'urn:user:c',
        email: 'c@x.test',
        name: 'C',
        status: 'INACTIVE',
        mustChangePassword: false,
        createdAt: ago(200),
      },
    ]);
    await connection.collection('businesses').insertMany([
      { ...base, urn: 'urn:business:1', name: 'Uno', slug: 'uno', status: 'ACTIVE', createdAt: new Date() },
      { ...base, urn: 'urn:business:2', name: 'Dos', slug: 'dos', status: 'SUSPENDED', createdAt: ago(200) },
    ]);
    await connection.collection('google_connections').insertMany([
      { urn: 'urn:google-connection:1', businessUrn: 'urn:business:1', status: 'ACTIVE' },
      { urn: 'urn:google-connection:3', businessUrn: 'urn:business:2', status: 'REVOKED' },
    ]);
    await connection.collection('locations').insertMany([
      { urn: 'urn:location:1', businessUrn: 'urn:business:1', title: 'Centro', googleLocationName: 'locations/1' },
      { urn: 'urn:location:2', businessUrn: 'urn:business:1', title: 'Palermo', googleLocationName: 'locations/2' },
    ]);
    await connection.collection('campaigns').insertMany([
      { urn: 'urn:campaign:1', businessUrn: 'urn:business:1', slug: 'a', status: 'ACTIVE', stats: { scans: 40 } },
      { urn: 'urn:campaign:2', businessUrn: 'urn:business:1', slug: 'b', status: 'PAUSED', stats: { scans: 5 } },
    ]);
    const review = (id: number, starRating: number, createdAt: Date, extra: Record<string, unknown> = {}) => ({
      urn: `urn:review:${String(id)}`,
      businessUrn: 'urn:business:1',
      locationUrn: 'urn:location:1',
      googleReviewId: `g-${String(id)}`,
      starRating,
      googleCreateTime: createdAt,
      ...extra,
    });
    await connection
      .collection('reviews')
      .insertMany([
        review(1, 5, new Date(), { reply: { comment: 'Gracias' } }),
        review(2, 3, ago(7)),
        review(3, 0, ago(7)),
        review(4, 1, ago(200)),
        review(5, 5, new Date(), { deletedAt: new Date() }),
      ]);
    await connection.collection('scan_events').insertMany([
      { businessUrn: 'urn:business:1', campaignUrn: 'urn:campaign:1', scannedAt: new Date() },
      { businessUrn: 'urn:business:1', campaignUrn: 'urn:campaign:1', scannedAt: new Date() },
      { businessUrn: 'urn:business:1', campaignUrn: 'urn:campaign:1', scannedAt: ago(7) },
      { businessUrn: 'urn:business:1', campaignUrn: 'urn:campaign:2', scannedAt: ago(200) },
    ]);
  };

  it('devuelve los totales de toda la plataforma', async () => {
    const adminAuth = await createAdmin(app);
    await seed();

    const { body } = await overview(adminAuth).expect(200);

    expect(body).toMatchObject({
      users: { total: 3, active: 2, pendingPasswordChange: 1 },
      businesses: { total: 2, active: 1, suspended: 1, googleConnected: 1 },
      locations: 2,
      campaigns: { total: 2, active: 1 },
      // Las borradas no cuentan; las sin estrellas no bajan el promedio.
      reviews: { total: 4, unanswered: 3, averageRating: 3 },
      scans: { total: 45 },
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect(new Date(body.scansTrackedSince).getTime()).toBeLessThan(ago(199).getTime());
  });

  it('da la evolución de las últimas 12 semanas, la actual al final, con las vacías en 0', async () => {
    const adminAuth = await createAdmin(app);
    await seed();

    const { body } = await overview(adminAuth).expect(200);

    expect(body.weeks).toHaveLength(12);
    const current = body.weeks[11];
    const previous = body.weeks[10];
    expect(current).toMatchObject({ users: 1, businesses: 1, reviews: 1, scans: 2 });
    expect(previous).toMatchObject({ users: 1, businesses: 0, reviews: 2, scans: 1 });
    expect(body.weeks[0]).toMatchObject({ users: 0, businesses: 0, reviews: 0, scans: 0 });
    // Semanas que empiezan en lunes, consecutivas.
    for (const [index, week] of (body.weeks as { week: string }[]).entries()) {
      expect(new Date(`${week.week}T12:00:00Z`).getUTCDay()).toBe(1);
      if (index > 0) {
        const gap = Date.parse(week.week) - Date.parse(body.weeks[index - 1].week);
        expect(gap).toBe(7 * DAY);
      }
    }
  });

  it('acepta otra cantidad de semanas, y sin datos devuelve ceros', async () => {
    const adminAuth = await createAdmin(app);

    const { body } = await overview(adminAuth, '?weeks=4').expect(200);

    expect(body.weeks).toHaveLength(4);
    expect(body).toMatchObject({
      users: { total: 0 },
      reviews: { total: 0, unanswered: 0, averageRating: null },
      scans: { total: 0 },
      scansTrackedSince: null,
    });
    await overview(adminAuth, '?weeks=53').expect(400);
  });

  it('solo con el token del admin', async () => {
    const user = await registerUser(app);

    await request(app.getHttpServer()).get('/api/admin/stats/overview').expect(401);
    await overview(user.auth).expect(401);
  });
});
