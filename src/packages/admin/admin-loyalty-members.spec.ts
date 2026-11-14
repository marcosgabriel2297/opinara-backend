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
const ANA = 'urn:loyalty-member:ana';

describe('Clientes de la tarjeta de sellos en el panel (integracion)', () => {
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

  const http = () => request(app.getHttpServer());
  const list = (auth: string, query = '') =>
    http().get(`/api/admin/loyalty/members${query}`).set('Authorization', auth);

  const program = (urn: string, businessUrn: string, locationUrn: string) => ({
    urn,
    businessUrn,
    locationUrn,
    slug: urn.split(':').at(-1),
    status: 'ACTIVE',
    stampsRequired: 5,
    rewardDescription: 'Un café gratis',
    stampCooldownMinutes: 10,
    stats: { members: 0, stamps: 0, redemptions: 0 },
    createdByUserUrn: 'urn:user:x',
  });

  const member = (urn: string, programUrn: string, businessUrn: string, extra: object) => ({
    urn,
    businessUrn,
    programUrn,
    memberCode: urn.slice(-3).toUpperCase().padEnd(6, 'X'),
    name: urn,
    phone: '+5491100000000',
    cardTokenHash: `hash-${urn}`,
    cardToken: { ciphertext: 'x', iv: 'x', tag: 'x', keyVersion: 1 },
    stamps: 0,
    totalStamps: 0,
    totalRedemptions: 0,
    lastStampAt: null,
    lastReminderAt: null,
    remindersOptOut: null,
    consent: { acceptedAt: ago(30), termsVersion: '2026-11-13', marketing: false },
    createdAt: ago(30),
    ...extra,
  });

  const seed = async () => {
    await connection.collection('users').insertMany([
      { urn: 'urn:user:cajero', email: 'cajero@cafe.test', name: 'Carla Cajera', status: 'ACTIVE' },
      { urn: 'urn:user:gerente', email: 'gerente@cafe.test', name: 'Gonzalo Gerente', status: 'ACTIVE' },
    ]);
    await connection.collection('businesses').insertMany([
      { urn: CAFE, name: 'Café', slug: 'cafe', status: 'ACTIVE', plan: 'REVIEWS_LOYALTY', ownerUserUrn: 'urn:user:x' },
      { urn: PELU, name: 'Pelu', slug: 'pelu', status: 'ACTIVE', plan: 'LOYALTY', ownerUserUrn: 'urn:user:x' },
    ]);
    await connection.collection('locations').insertMany([
      { urn: 'urn:location:centro', googleLocationName: 'locations/centro', businessUrn: CAFE, title: 'Centro' },
      { urn: 'urn:location:norte', googleLocationName: 'locations/norte', businessUrn: CAFE, title: 'Norte' },
      { urn: 'urn:location:corte', googleLocationName: 'locations/corte', businessUrn: PELU, title: 'Peluquería' },
    ]);
    await connection
      .collection('loyalty_programs')
      .insertMany([
        program(CENTRO, CAFE, 'urn:location:centro'),
        program(NORTE, CAFE, 'urn:location:norte'),
        program(CORTE, PELU, 'urn:location:corte'),
      ]);
    await connection.collection('loyalty_members').insertMany([
      member(ANA, CENTRO, CAFE, {
        name: 'Ana Pérez',
        phone: '+5491123456789',
        email: 'ana@cliente.test',
        memberCode: 'K3F9QX',
        stamps: 5,
        totalStamps: 12,
        totalRedemptions: 1,
        lastStampAt: ago(2),
        lastReminderAt: ago(5),
        lastReminderByUserUrn: 'urn:user:gerente',
        consent: { acceptedAt: ago(40), termsVersion: '2026-11-13', marketing: true },
        createdAt: ago(40),
      }),
      member('urn:loyalty-member:bruno', NORTE, CAFE, {
        name: 'Bruno Díaz',
        phone: '+5491155550000',
        remindersOptOut: { at: ago(1), by: 'BUSINESS', byUserUrn: 'urn:user:gerente' },
        createdAt: ago(10),
      }),
      member('urn:loyalty-member:eva', CORTE, PELU, { name: 'Eva Gómez', phone: '+5491166660000', createdAt: ago(1) }),
    ]);
    const event = (type: string, daysAgo: number, extra: object = {}) => ({
      urn: `urn:loyalty-event:${type}-${daysAgo}`,
      businessUrn: CAFE,
      programUrn: CENTRO,
      locationUrn: 'urn:location:centro',
      memberUrn: ANA,
      type,
      amount: type === 'REDEMPTION' ? 5 : 1,
      byUserUrn: 'urn:user:cajero',
      undoneAt: null,
      createdAt: ago(daysAgo),
      ...extra,
    });
    await connection.collection('loyalty_events').insertMany([
      event('STAMP', 20),
      event('REDEMPTION', 10),
      event('STAMP', 3, { undoneAt: ago(3), undoneByUserUrn: 'urn:user:cajero' }),
      event('STAMP_REMOVAL', 2.5, { byUserUrn: 'urn:user:gerente', amount: 2 }),
      event('STAMP', 2),
      // De otro cliente: no aparece.
      { ...event('STAMP', 1), urn: 'urn:loyalty-event:otro', memberUrn: 'urn:loyalty-member:bruno' },
    ]);
  };

  it('lista los clientes de todos los negocios con todos sus datos, los más nuevos primero', async () => {
    const adminAuth = await createAdmin(app);
    await seed();

    const { body } = await list(adminAuth).expect(200);

    expect(body.total).toBe(3);
    expect(body.items.map((item: { name: string }) => item.name)).toEqual(['Eva Gómez', 'Bruno Díaz', 'Ana Pérez']);
    expect(body.items[2]).toMatchObject({
      urn: ANA,
      memberCode: 'K3F9QX',
      name: 'Ana Pérez',
      phone: '+5491123456789',
      email: 'ana@cliente.test',
      business: { urn: CAFE, name: 'Café' },
      program: { urn: CENTRO, status: 'ACTIVE', stampsRequired: 5, rewardDescription: 'Un café gratis' },
      location: { urn: 'urn:location:centro', title: 'Centro' },
      stamps: 5,
      rewardAvailable: true,
      totalStamps: 12,
      totalRedemptions: 1,
      consent: { termsVersion: '2026-11-13', marketing: true },
      reminders: {
        lastReminderBy: { urn: 'urn:user:gerente', name: 'Gonzalo Gerente', email: 'gerente@cafe.test' },
        cameBack: true,
        optOut: null,
      },
    });
    expect(body.items[1].reminders.optOut).toMatchObject({ by: 'BUSINESS', byUser: { name: 'Gonzalo Gerente' } });
  });

  it('filtra por negocio y sucursal, y busca por nombre, email, código o los últimos dígitos del celular', async () => {
    const adminAuth = await createAdmin(app);
    await seed();
    const names = async (query: string) =>
      ((await list(adminAuth, query).expect(200)).body.items as { name: string }[]).map((item) => item.name);

    expect(await names(`?businessUrn=${CAFE}`)).toEqual(['Bruno Díaz', 'Ana Pérez']);
    expect(await names(`?businessUrn=${CAFE}&locationUrn=urn:location:norte`)).toEqual(['Bruno Díaz']);
    expect(await names('?search=pérez')).toEqual(['Ana Pérez']);
    expect(await names('?search=cliente.test')).toEqual(['Ana Pérez']);
    expect(await names('?search=k3f9qx')).toEqual(['Ana Pérez']);
    expect(await names('?search=0000')).toEqual(['Eva Gómez', 'Bruno Díaz']);
    expect((await list(adminAuth, '?limit=1&page=1').expect(200)).body).toMatchObject({ total: 3, page: 1, limit: 1 });
  });

  it('la ficha trae el historial, lo último primero, con quién lo hizo y lo deshecho', async () => {
    const adminAuth = await createAdmin(app);
    await seed();

    const { body } = await http().get(`/api/admin/loyalty/members/${ANA}`).set('Authorization', adminAuth).expect(200);

    expect(body).toMatchObject({ name: 'Ana Pérez', email: 'ana@cliente.test', eventsTruncated: false });
    expect(body.events.map((event: { type: string }) => event.type)).toEqual([
      'STAMP',
      'STAMP_REMOVAL',
      'STAMP',
      'REDEMPTION',
      'STAMP',
    ]);
    expect(body.events[1]).toMatchObject({ amount: 2, by: { name: 'Gonzalo Gerente' }, undoneAt: null });
    expect(body.events[2]).toMatchObject({
      by: { name: 'Carla Cajera', email: 'cajero@cafe.test' },
      undoneAt: expect.any(String),
      undoneBy: { name: 'Carla Cajera' },
    });
  });

  it('un cliente que no existe da 404', async () => {
    const adminAuth = await createAdmin(app);

    const response = await http()
      .get('/api/admin/loyalty/members/urn:loyalty-member:no-existe')
      .set('Authorization', adminAuth)
      .expect(404);
    expect(response.body.errorCode).toBe('LOYALTY_MEMBER_NOT_FOUND');
  });

  it('solo con el token del administrador', async () => {
    const user = await registerUser(app);

    await http().get('/api/admin/loyalty/members').expect(401);
    await list(user.auth).expect(401);
    await http().get(`/api/admin/loyalty/members/${ANA}`).set('Authorization', user.auth).expect(401);
  });
});
