import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { createAdmin, registerUser } from '../../../test/helpers';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

const CAFE = 'urn:business:cafe';
const PELU = 'urn:business:pelu';
const CENTRO = 'urn:loyalty-program:centro';
const NORTE = 'urn:loyalty-program:norte';
const CORTE = 'urn:loyalty-program:corte';

describe('Tarjeta de sellos en el panel (integracion)', () => {
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
        'loyalty_programs',
        'loyalty_members',
        'loyalty_events',
      ].map((name) => connection.collection(name).deleteMany({})),
    );
  });

  const report = (auth: string, query = '') =>
    request(app.getHttpServer()).get(`/api/admin/loyalty${query}`).set('Authorization', auth);

  const program = (urn: string, businessUrn: string, locationUrn: string, status: string, stats: object) => ({
    urn,
    businessUrn,
    locationUrn,
    slug: urn.split(':').at(-1),
    status,
    stampsRequired: 5,
    rewardDescription: 'Un café',
    stampCooldownMinutes: 10,
    stats,
    createdByUserUrn: 'urn:user:x',
  });

  const member = (urn: string, programUrn: string, businessUrn: string, extra: object) => ({
    urn,
    businessUrn,
    programUrn,
    memberCode: urn.slice(-6).toUpperCase(),
    name: urn,
    phone: `+54911${urn.length}${Math.random()}`,
    cardTokenHash: `hash-${urn}`,
    cardToken: { ciphertext: 'x', iv: 'x', tag: 'x', keyVersion: 1 },
    stamps: 0,
    totalStamps: 0,
    totalRedemptions: 0,
    lastStampAt: null,
    lastReminderAt: null,
    remindersOptOut: null,
    consent: { acceptedAt: ago(30), termsVersion: '2026-11-13', marketing: false },
    // Antes del período: solo cuentan como nuevos los que dicen otra cosa.
    createdAt: ago(200),
    ...extra,
  });

  const event = (programUrn: string, businessUrn: string, type: string, daysAgo: number, undone = false) => ({
    urn: `urn:loyalty-event:${Math.random()}`,
    businessUrn,
    programUrn,
    locationUrn: 'urn:location:x',
    memberUrn: 'urn:loyalty-member:x',
    type,
    amount: type === 'REDEMPTION' ? 5 : 1,
    byUserUrn: 'urn:user:x',
    undoneAt: undone ? ago(daysAgo) : null,
    createdAt: ago(daysAgo),
  });

  const seed = async () => {
    await connection.collection('businesses').insertMany([
      { urn: CAFE, name: 'Café', slug: 'cafe', status: 'ACTIVE', plan: 'REVIEWS_LOYALTY', ownerUserUrn: 'urn:user:x' },
      { urn: PELU, name: 'Pelu', slug: 'pelu', status: 'ACTIVE', plan: 'LOYALTY', ownerUserUrn: 'urn:user:x' },
      {
        urn: 'urn:business:solo-resenas',
        name: 'Solo reseñas',
        slug: 'solo',
        status: 'ACTIVE',
        plan: 'REVIEWS',
        ownerUserUrn: 'urn:user:x',
      },
    ]);
    await connection.collection('locations').insertMany([
      { urn: 'urn:location:centro', googleLocationName: 'locations/centro', businessUrn: CAFE, title: 'Centro' },
      { urn: 'urn:location:norte', googleLocationName: 'locations/norte', businessUrn: CAFE, title: 'Norte' },
      { urn: 'urn:location:corte', googleLocationName: 'locations/corte', businessUrn: PELU, title: 'Peluquería' },
    ]);
    await connection
      .collection('loyalty_programs')
      .insertMany([
        program(CENTRO, CAFE, 'urn:location:centro', 'ACTIVE', { members: 3, stamps: 40, redemptions: 4 }),
        program(NORTE, CAFE, 'urn:location:norte', 'PAUSED', { members: 1, stamps: 90, redemptions: 9 }),
        program(CORTE, PELU, 'urn:location:corte', 'ACTIVE', { members: 1, stamps: 7, redemptions: 1 }),
      ]);
    await connection.collection('loyalty_members').insertMany([
      // Con premio listo; le recordaron y volvió.
      member('urn:loyalty-member:ana', CENTRO, CAFE, { stamps: 5, lastReminderAt: ago(10), lastStampAt: ago(2) }),
      // Le recordaron y no volvió.
      member('urn:loyalty-member:bruno', CENTRO, CAFE, { stamps: 2, lastReminderAt: ago(3), lastStampAt: ago(25) }),
      // Pidió no recibir más; se sumó esta semana.
      member('urn:loyalty-member:caro', CENTRO, CAFE, {
        remindersOptOut: { at: ago(1), by: 'CLIENT' },
        createdAt: ago(1),
      }),
      member('urn:loyalty-member:dani', NORTE, CAFE, { stamps: 1, lastStampAt: ago(200) }),
      member('urn:loyalty-member:eva', CORTE, PELU, { stamps: 5, lastStampAt: ago(5) }),
    ]);
    await connection
      .collection('loyalty_events')
      .insertMany([
        event(CENTRO, CAFE, 'STAMP', 1),
        event(CENTRO, CAFE, 'STAMP', 8),
        event(CENTRO, CAFE, 'STAMP', 8, true),
        event(CENTRO, CAFE, 'REDEMPTION', 8),
        event(CENTRO, CAFE, 'STAMP_REMOVAL', 2),
        event(CENTRO, CAFE, 'STAMP', 400),
        event(CORTE, PELU, 'STAMP', 1),
        event(CORTE, PELU, 'STAMP', 2),
        event(CORTE, PELU, 'STAMP', 3),
      ]);
  };

  it('da totales, sellos y canjes vigentes por semana, recordatorios y el ranking de sucursales', async () => {
    const adminAuth = await createAdmin(app);
    await seed();

    const { body } = await report(adminAuth).expect(200);

    expect(body.weeks).toHaveLength(12);
    // Sin los deshechos, ni el de hace 400 días.
    expect(body.inPeriod).toEqual({ stamps: 5, redemptions: 1, members: 1, corrections: 1 });
    expect(body.weeks.reduce((sum: number, week: { stamps: number }) => sum + week.stamps, 0)).toBe(5);
    expect(body.totals).toEqual({ members: 5, stamps: 137, redemptions: 14, rewardsPending: 2 });
    expect(body.reminders).toEqual({ reminded: 2, cameBack: 1, optedOut: 1 });
    expect(body.programs).toEqual({ total: 3, active: 2, paused: 1 });
    expect(body.businesses).toEqual({ withPlan: 2, withProgram: 2 });

    // Más sellos en el período primero; a igualdad, más en total.
    expect(body.ranking.map((row: { urn: string }) => row.urn)).toEqual([CORTE, CENTRO, NORTE]);
    expect(body.ranking[1]).toMatchObject({
      business: { urn: CAFE, name: 'Café' },
      location: { title: 'Centro' },
      status: 'ACTIVE',
      members: 3,
      stampsInPeriod: 2,
      redemptionsInPeriod: 1,
      stampsTotal: 40,
      redemptionsTotal: 4,
    });
  });

  it('filtra por negocio', async () => {
    const adminAuth = await createAdmin(app);
    await seed();

    const { body } = await report(adminAuth, `?businessUrn=${PELU}&weeks=4`).expect(200);

    expect(body.weeks).toHaveLength(4);
    expect(body.inPeriod).toMatchObject({ stamps: 3, redemptions: 0 });
    expect(body.totals).toMatchObject({ members: 1, stamps: 7, rewardsPending: 1 });
    expect(body.businesses).toEqual({ withPlan: 1, withProgram: 1 });
    expect(body.ranking.map((row: { urn: string }) => row.urn)).toEqual([CORTE]);
  });

  it('sin datos devuelve ceros', async () => {
    const adminAuth = await createAdmin(app);

    const { body } = await report(adminAuth).expect(200);

    expect(body.totals).toEqual({ members: 0, stamps: 0, redemptions: 0, rewardsPending: 0 });
    expect(body.ranking).toEqual([]);
  });

  it('solo con el token del administrador', async () => {
    const user = await registerUser(app);

    await request(app.getHttpServer()).get('/api/admin/loyalty').expect(401);
    await report(user.auth).expect(401);
  });
});
