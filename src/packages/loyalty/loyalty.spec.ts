import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { MAILER } from '@shared/common/mailer';
import { createTestApp } from '../../../test/app.factory';
import { TestUser, createAdmin, createBusiness, registerUser } from '../../../test/helpers';
import { FakeMailer } from '../../../test/mailer.fake';

const CENTRO = 'urn:location:dddddddd-0000-4000-8000-000000000001';
const NORTE = 'urn:location:dddddddd-0000-4000-8000-000000000002';
const CERRADA = 'urn:location:dddddddd-0000-4000-8000-000000000003';
const TOKEN_HEADER = 'X-Loyalty-Card-Token';

const COLLECTIONS = [
  'users',
  'admins',
  'sessions',
  'businesses',
  'business_members',
  'locations',
  'loyalty_programs',
  'loyalty_members',
  'loyalty_events',
  'admin_audit_events',
  'campaigns',
];

const tokenFromMail = (text: string | undefined): string => /#token=([A-Za-z0-9_-]+)/.exec(text ?? '')?.[1] ?? '';

describe('Fidelizacion: tarjeta de sellos (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  const mailer = new FakeMailer();

  let owner: TestUser;
  /** Un cajero: rol MEMBER. */
  let cajero: TestUser;
  let business: { urn: string; slug: string };

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp({ PUBLIC_APP_BASE_URL: 'https://app.opinara.test' }, [
      { token: MAILER, value: mailer },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    mailer.sent.length = 0;
    owner = await registerUser(app);
    cajero = await registerUser(app);
    business = await createBusiness(app, owner, { name: `Café ${Date.now()}${Math.random()}` });

    await connection.collection('business_members').insertOne({
      urn: `urn:business-member:${Date.now()}`,
      businessUrn: business.urn,
      userUrn: cajero.urn,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    await connection.collection('locations').insertMany(
      [
        { urn: CENTRO, title: 'Sucursal Centro', isActive: true },
        { urn: NORTE, title: 'Sucursal Norte', isActive: true },
        { urn: CERRADA, title: 'Sucursal Cerrada', isActive: false },
      ].map((location) => ({
        ...location,
        businessUrn: business.urn,
        googleAccountName: 'accounts/manual',
        googleLocationName: `locations/${location.urn}`,
        googleLocationId: location.urn,
        hasVoiceOfMerchant: false,
        source: 'MANUAL',
      })),
    );
    await setPlan('REVIEWS_LOYALTY');
  });

  afterEach(async () => {
    await Promise.all(COLLECTIONS.map((name) => connection.collection(name).deleteMany({})));
  });

  const http = () => request(app.getHttpServer());
  const base = () => `/api/businesses/${business.urn}/loyalty`;

  const setPlan = (plan: string) =>
    connection.collection('businesses').updateOne({ urn: business.urn }, { $set: { plan } });

  const createProgram = async (payload: Record<string, unknown> = {}) => {
    const response = await http()
      .post(`${base()}/programs`)
      .set('Authorization', owner.auth)
      .send({ locationUrn: CENTRO, rewardDescription: 'Un café gratis', ...payload })
      .expect(201);
    return response.body as { urn: string; slug: string; signupUrl: string };
  };

  const register = (programSlug: string, payload: Record<string, unknown> = {}) =>
    http()
      .post(`/api/public/loyalty/${business.slug}/${programSlug}/members`)
      .send({ name: 'Ana', phone: '11 2345-6789', acceptTerms: true, ...payload });

  /** Alta y lectura de la tarjeta: devuelve el token y el codigo que lee la caja. */
  const signUp = async (programSlug: string, payload: Record<string, unknown> = {}) => {
    const { body } = await register(programSlug, payload).expect(201);
    const card = await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, body.cardToken).expect(200);
    return { token: body.cardToken as string, code: card.body.member.memberCode as string };
  };

  const stamp = (programUrn: string, code: string, auth = cajero.auth) =>
    http().post(`${base()}/programs/${programUrn}/members/${code}/stamps`).set('Authorization', auth);

  const redeem = (programUrn: string, code: string, auth = cajero.auth) =>
    http().post(`${base()}/programs/${programUrn}/members/${code}/redemptions`).set('Authorization', auth);

  /** Simula que paso el tiempo minimo desde el ultimo sello. */
  const skipCooldown = (code: string) =>
    connection.collection('loyalty_members').updateOne({ memberCode: code }, { $set: { lastStampAt: null } });

  const stampTimes = async (programUrn: string, code: string, times: number) => {
    for (let i = 0; i < times; i += 1) {
      await skipCooldown(code);
      await stamp(programUrn, code).expect(201);
    }
  };

  describe('planes', () => {
    it('el negocio expone su plan y lo que incluye', async () => {
      const { body } = await http().get(`/api/businesses/${business.urn}`).set('Authorization', owner.auth).expect(200);

      expect(body).toMatchObject({ plan: 'REVIEWS_LOYALTY', features: ['REVIEWS', 'LOYALTY'] });
    });

    it('un negocio sin el plan recibe PLAN_FEATURE_NOT_INCLUDED y su alta publica no existe', async () => {
      const program = await createProgram();
      await setPlan('REVIEWS');

      const response = await http().get(`${base()}/programs`).set('Authorization', owner.auth).expect(403);
      expect(response.body.errorCode).toBe('PLAN_FEATURE_NOT_INCLUDED');

      await http().get(`/api/public/loyalty/${business.slug}/${program.slug}`).expect(404);
    });

    it('los negocios sin plan cuentan como el de entrada', async () => {
      await connection.collection('businesses').updateOne({ urn: business.urn }, { $unset: { plan: '' } });

      const { body } = await http().get(`/api/businesses/${business.urn}`).set('Authorization', owner.auth).expect(200);
      expect(body).toMatchObject({ plan: 'REVIEWS', features: ['REVIEWS'] });
      await http().get(`${base()}/programs`).set('Authorization', owner.auth).expect(403);
    });

    it('con solo fidelizacion: la tarjeta anda, las reseñas y las campañas no, y el QR no lleva a Google', async () => {
      await setPlan('LOYALTY');
      await connection
        .collection('locations')
        .updateOne(
          { urn: CENTRO },
          { $set: { newReviewUri: 'https://search.google.com/local/writereview?placeid=x' } },
        );
      await connection.collection('campaigns').insertOne({
        urn: 'urn:campaign:mostrador',
        businessUrn: business.urn,
        locationUrn: CENTRO,
        name: 'Mostrador',
        slug: 'mostrador',
        status: 'ACTIVE',
        stats: { scans: 0, googleClicks: 0 },
        createdByUserUrn: owner.urn,
      });

      const { body } = await http().get(`/api/businesses/${business.urn}`).set('Authorization', owner.auth).expect(200);
      expect(body).toMatchObject({ plan: 'LOYALTY', features: ['LOYALTY'] });

      await createProgram();
      for (const path of ['reviews', 'campaigns', 'scans', `locations/${CENTRO}/reviews`]) {
        const response = await http().get(`/api/businesses/${business.urn}/${path}`).set('Authorization', owner.auth);
        expect({ path, status: response.status, code: response.body.errorCode }).toEqual({
          path,
          status: 403,
          code: 'PLAN_FEATURE_NOT_INCLUDED',
        });
      }
      // Las sucursales siguen: la tarjeta de sellos es por sucursal.
      await http().get(`/api/businesses/${business.urn}/locations`).set('Authorization', owner.auth).expect(200);

      const scan = await http().get(`/api/public/r/${business.slug}/mostrador`).expect(302);
      expect(scan.headers.location).toMatch(/\/r\/no-disponible$/);
      expect((await connection.collection('campaigns').findOne({ slug: 'mostrador' }))?.stats.scans).toBe(0);
    });

    it('a quien no es miembro le responde 404, no 403', async () => {
      const ajeno = await registerUser(app);

      await http().get(`${base()}/programs`).set('Authorization', ajeno.auth).expect(404);
    });

    it('el admin cambia el plan y queda en la auditoria', async () => {
      await setPlan('REVIEWS');
      const adminAuth = await createAdmin(app);

      const { body } = await http()
        .post(`/api/admin/businesses/${business.urn}/plan`)
        .set('Authorization', adminAuth)
        .send({ plan: 'REVIEWS_LOYALTY' })
        .expect(200);

      expect(body.plan).toBe('REVIEWS_LOYALTY');
      expect(
        await connection.collection('admin_audit_events').countDocuments({ action: 'BUSINESS_PLAN_CHANGED' }),
      ).toBe(1);
      await http().get(`${base()}/programs`).set('Authorization', owner.auth).expect(200);

      await http()
        .post(`/api/admin/businesses/${business.urn}/plan`)
        .set('Authorization', adminAuth)
        .send({ plan: 'GRATIS' })
        .expect(400);
    });
  });

  describe('programas', () => {
    it('crea el programa de la sucursal con su URL de alta', async () => {
      const program = await createProgram();

      expect(program).toMatchObject({
        slug: 'sucursal-centro',
        status: 'ACTIVE',
        stampsRequired: 5,
        stampCooldownMinutes: 10,
        rewardDescription: 'Un café gratis',
        location: { urn: CENTRO, title: 'Sucursal Centro', isActive: true },
        stats: { members: 0, stamps: 0, redemptions: 0 },
        signupUrl: `https://app.opinara.test/f/${business.slug}/sucursal-centro`,
      });
    });

    it('uno por sucursal y con slug unico', async () => {
      await createProgram();

      const again = await http()
        .post(`${base()}/programs`)
        .set('Authorization', owner.auth)
        .send({ locationUrn: CENTRO, rewardDescription: 'Otro' })
        .expect(409);
      expect(again.body.errorCode).toBe('LOYALTY_PROGRAM_ALREADY_EXISTS');

      const slug = await http()
        .post(`${base()}/programs`)
        .set('Authorization', owner.auth)
        .send({ locationUrn: NORTE, rewardDescription: 'Otro', slug: 'sucursal-centro' })
        .expect(409);
      expect(slug.body.errorCode).toBe('LOYALTY_PROGRAM_SLUG_ALREADY_EXISTS');
    });

    it('no acepta sucursales inactivas ni de otro negocio', async () => {
      await http()
        .post(`${base()}/programs`)
        .set('Authorization', owner.auth)
        .send({ locationUrn: CERRADA, rewardDescription: 'Un café' })
        .expect(404);

      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Vecino' });
      await connection.collection('businesses').updateOne({ urn: otro.urn }, { $set: { plan: 'REVIEWS_LOYALTY' } });
      await http()
        .post(`/api/businesses/${otro.urn}/loyalty/programs`)
        .set('Authorization', ajeno.auth)
        .send({ locationUrn: CENTRO, rewardDescription: 'Robado' })
        .expect(404);
    });

    it('un MEMBER ve los programas pero no los configura', async () => {
      const program = await createProgram();

      await http().get(`${base()}/programs`).set('Authorization', cajero.auth).expect(200);
      await http()
        .patch(`${base()}/programs/${program.urn}`)
        .set('Authorization', cajero.auth)
        .send({ stampsRequired: 3 })
        .expect(403);
      await http()
        .post(`${base()}/programs`)
        .set('Authorization', cajero.auth)
        .send({ locationUrn: NORTE, rewardDescription: 'x' + 'y' })
        .expect(403);
    });

    it('arma el QR del alta para imprimir, solo para OWNER y ADMIN', async () => {
      const program = await createProgram();

      const { body } = await http()
        .post(`${base()}/programs/${program.urn}/qr`)
        .set('Authorization', owner.auth)
        .expect(201);
      expect(body).toMatchObject({ targetUrl: program.signupUrl });
      expect(body.pngDataUrl).toMatch(/^data:image\/png;base64,/);

      await http().post(`${base()}/programs/${program.urn}/qr`).set('Authorization', cajero.auth).expect(403);
    });

    it('edita el premio, los sellos y las condiciones, sin tocar el slug', async () => {
      const program = await createProgram({ terms: 'No acumulable' });

      const { body } = await http()
        .patch(`${base()}/programs/${program.urn}`)
        .set('Authorization', owner.auth)
        .send({ rewardDescription: 'Una medialuna', stampsRequired: 8, terms: '' })
        .expect(200);
      expect(body).toMatchObject({ rewardDescription: 'Una medialuna', stampsRequired: 8, terms: null });

      await http()
        .patch(`${base()}/programs/${program.urn}`)
        .set('Authorization', owner.auth)
        .send({ slug: 'otro' })
        .expect(400);
    });
  });

  describe('alta publica', () => {
    it('muestra el programa sin identificadores internos y sin cache', async () => {
      const program = await createProgram({ terms: 'Válido de lunes a viernes' });

      const response = await http().get(`/api/public/loyalty/${business.slug}/${program.slug}`).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        location: { title: 'Sucursal Centro' },
        program: { rewardDescription: 'Un café gratis', stampsRequired: 5, terms: 'Válido de lunes a viernes' },
      });
      expect(JSON.stringify(response.body)).not.toContain('urn:');
    });

    it('crea la tarjeta, manda la bienvenida y no guarda el token en claro', async () => {
      const program = await createProgram();

      const { body } = await register(program.slug, { email: 'Ana@Mail.test', marketing: true }).expect(201);
      expect(body.cardToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const mail = await mailer.lastTo('ana@mail.test');
      expect(tokenFromMail(mail?.text)).toBe(body.cardToken);
      expect(mail?.text).not.toMatch(/reseña/i);

      const stored = await connection.collection('loyalty_members').findOne({});
      expect(stored).toMatchObject({ phone: '+5491123456789', email: 'ana@mail.test', consent: { marketing: true } });
      expect(JSON.stringify(stored)).not.toContain(body.cardToken);

      const programs = await http().get(`${base()}/programs`).set('Authorization', owner.auth).expect(200);
      expect(programs.body[0].stats.members).toBe(1);
    });

    it('exige aceptar las condiciones y un celular valido', async () => {
      const program = await createProgram();

      await register(program.slug, { acceptTerms: false }).expect(400);
      await register(program.slug, { acceptTerms: undefined }).expect(400);
      const phone = await register(program.slug, { phone: '1234' }).expect(400);
      expect(phone.body.errorCode).toBe('LOYALTY_INVALID_PHONE');
    });

    it('el mismo celular en otro formato no saca otra tarjeta: se reenvia el link al mail', async () => {
      const program = await createProgram();
      const { body } = await register(program.slug, { email: 'ana@mail.test' }).expect(201);
      mailer.sent.length = 0;

      const again = await register(program.slug, { phone: '+54 9 11 2345 6789', name: 'Otra' }).expect(409);

      expect(again.body.errorCode).toBe('LOYALTY_ALREADY_REGISTERED');
      expect(JSON.stringify(again.body)).not.toContain(body.cardToken);
      expect(tokenFromMail((await mailer.lastTo('ana@mail.test'))?.text)).toBe(body.cardToken);
    });

    it('el mismo celular puede tener tarjeta en otra sucursal', async () => {
      const centro = await createProgram();
      const norte = await createProgram({ locationUrn: NORTE });

      await register(centro.slug).expect(201);
      await register(norte.slug).expect(201);
    });

    it('a un bot (campo trampa) le contesta como a cualquiera, sin crear nada', async () => {
      const program = await createProgram();

      await register(program.slug, { website: 'http://spam.test' }).expect(201);

      expect(await connection.collection('loyalty_members').countDocuments()).toBe(0);
    });

    it('un programa pausado o de una sucursal inactiva no admite altas', async () => {
      const program = await createProgram();
      await http()
        .patch(`${base()}/programs/${program.urn}`)
        .set('Authorization', owner.auth)
        .send({ status: 'PAUSED' })
        .expect(200);

      await http().get(`/api/public/loyalty/${business.slug}/${program.slug}`).expect(404);
      await register(program.slug).expect(404);

      await http()
        .patch(`${base()}/programs/${program.urn}`)
        .set('Authorization', owner.auth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await connection.collection('locations').updateOne({ urn: CENTRO }, { $set: { isActive: false } });
      await register(program.slug).expect(404);
    });

    it('reenviar el link responde igual exista o no la tarjeta', async () => {
      const program = await createProgram();
      const { body } = await register(program.slug, { email: 'ana@mail.test' }).expect(201);
      mailer.sent.length = 0;

      const send = (phone: string) =>
        http()
          .post('/api/public/loyalty/card/resend')
          .send({ businessSlug: business.slug, programSlug: program.slug, phone })
          .expect(204);

      await send('1199998888');
      expect(mailer.sent).toHaveLength(0);

      await send('011 15 2345 6789');
      expect(tokenFromMail((await mailer.lastTo('ana@mail.test'))?.text)).toBe(body.cardToken);
    });
  });

  describe('la tarjeta', () => {
    it('se ve con el token y no sin el', async () => {
      const program = await createProgram();
      const { token } = await signUp(program.slug);

      const response = await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, token).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        location: { title: 'Sucursal Centro' },
        program: { stampsRequired: 5, active: true },
        member: { name: 'Ana', stamps: 0, rewardAvailable: false },
      });
      expect(response.body.member.memberCode).toMatch(/^[A-Z2-9]{6}$/);
      expect(response.body.member.qrPngDataUrl).toMatch(/^data:image\/png;base64,/);

      await http().get('/api/public/loyalty/card').expect(404);
      await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, 'x'.repeat(43)).expect(404);
    });

    it('si el negocio baja de plan, la tarjeta se sigue viendo pero no esta activa', async () => {
      const program = await createProgram();
      const { token } = await signUp(program.slug);
      await setPlan('REVIEWS');

      const { body } = await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, token).expect(200);
      expect(body.program.active).toBe(false);
    });

    it('el cliente borra sus datos desde la tarjeta', async () => {
      const program = await createProgram();
      const { token, code } = await signUp(program.slug);
      await stamp(program.urn, code).expect(201);

      await http().delete('/api/public/loyalty/card').set(TOKEN_HEADER, token).expect(204);

      await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, token).expect(404);
      expect(await connection.collection('loyalty_members').countDocuments()).toBe(0);
      // El historial queda, sin datos personales.
      const event = await connection.collection('loyalty_events').findOne({});
      expect(Object.keys(event ?? {})).not.toEqual(expect.arrayContaining(['name', 'phone', 'email']));
      const programs = await http().get(`${base()}/programs`).set('Authorization', owner.auth).expect(200);
      expect(programs.body[0].stats.members).toBe(0);
    });
  });

  describe('la caja', () => {
    it('lee la tarjeta por su codigo y dice de que sucursal es', async () => {
      const program = await createProgram();
      const { code } = await signUp(program.slug);

      const { body } = await http()
        .get(`${base()}/members/${code.toLowerCase()}`)
        .set('Authorization', cajero.auth)
        .expect(200);

      expect(body).toMatchObject({
        memberCode: code,
        name: 'Ana',
        phone: '+5491123456789',
        stamps: 0,
        program: { urn: program.urn, locationUrn: CENTRO, locationTitle: 'Sucursal Centro' },
      });
      await http().get(`${base()}/members/NOEXIS`).set('Authorization', cajero.auth).expect(404);
    });

    it('busca por los ultimos digitos del celular o por nombre', async () => {
      const program = await createProgram();
      await signUp(program.slug);
      await signUp(program.slug, { name: 'Bruno', phone: '11 5555-0000' });

      const search = (value: string) =>
        http()
          .get(`${base()}/programs/${program.urn}/members`)
          .query({ search: value })
          .set('Authorization', cajero.auth)
          .expect(200);

      expect((await search('6789')).body).toMatchObject({ total: 1, items: [{ name: 'Ana' }] });
      expect((await search('bru')).body).toMatchObject({ total: 1, items: [{ name: 'Bruno' }] });
      const ana = await connection.collection('loyalty_members').findOne({ name: 'Ana' });
      const code = String(ana?.memberCode);
      expect((await search(`${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`)).body).toMatchObject({
        total: 1,
        items: [{ name: 'Ana' }],
      });
      expect((await search('')).body.total).toBe(2);
    });

    it('suma un sello y no deja sumar otro enseguida', async () => {
      const program = await createProgram();
      const { code } = await signUp(program.slug);

      const { body } = await stamp(program.urn, code).expect(201);
      expect(body).toMatchObject({
        member: { stamps: 1, stampsRequired: 5, rewardAvailable: false },
        event: { type: 'STAMP', amount: 1 },
        rewardReached: false,
      });

      const again = await stamp(program.urn, code).expect(409);
      expect(again.body.errorCode).toBe('LOYALTY_STAMP_COOLDOWN');
    });

    it('dos sellos a la vez suman uno solo', async () => {
      const program = await createProgram();
      const { code } = await signUp(program.slug);

      const responses = await Promise.all(Array.from({ length: 5 }, () => stamp(program.urn, code)));

      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      expect((await connection.collection('loyalty_members').findOne({ memberCode: code }))?.stamps).toBe(1);
      expect(await connection.collection('loyalty_events').countDocuments()).toBe(1);
    });

    it('una tarjeta de otra sucursal no suma aca', async () => {
      const centro = await createProgram();
      const norte = await createProgram({ locationUrn: NORTE });
      const { code } = await signUp(centro.slug);

      const response = await stamp(norte.urn, code).expect(409);
      expect(response.body.errorCode).toBe('LOYALTY_WRONG_LOCATION');
    });

    it('una tarjeta de otro negocio no existe', async () => {
      const program = await createProgram();
      const { code } = await signUp(program.slug);

      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Vecino' });
      await connection.collection('businesses').updateOne({ urn: otro.urn }, { $set: { plan: 'REVIEWS_LOYALTY' } });

      await http()
        .get(`/api/businesses/${otro.urn}/loyalty/members/${code}`)
        .set('Authorization', ajeno.auth)
        .expect(404);
      await http()
        .post(`/api/businesses/${otro.urn}/loyalty/programs/${program.urn}/members/${code}/stamps`)
        .set('Authorization', ajeno.auth)
        .expect(404);
    });

    it('al quinto sello avisa el premio (y manda el mail); el canje deja lo que sobra', async () => {
      const program = await createProgram();
      const { code } = await signUp(program.slug, { email: 'ana@mail.test' });
      mailer.sent.length = 0;

      await stampTimes(program.urn, code, 4);
      await skipCooldown(code);
      const fifth = await stamp(program.urn, code).expect(201);
      expect(fifth.body).toMatchObject({ member: { stamps: 5, rewardAvailable: true }, rewardReached: true });
      expect((await mailer.lastTo('ana@mail.test'))?.subject).toMatch(/premio/);

      await skipCooldown(code);
      const sixth = await stamp(program.urn, code).expect(201);
      expect(sixth.body.rewardReached).toBe(false);

      const { body } = await redeem(program.urn, code).expect(201);
      expect(body).toMatchObject({
        member: { stamps: 1, rewardAvailable: false, totalRedemptions: 1 },
        event: { type: 'REDEMPTION', amount: 5 },
      });

      const programs = await http().get(`${base()}/programs`).set('Authorization', owner.auth).expect(200);
      expect(programs.body[0].stats).toMatchObject({ members: 1, stamps: 6, redemptions: 1 });
    });

    it('no canjea sin sellos suficientes, ni dos veces el mismo premio', async () => {
      const program = await createProgram({ stampsRequired: 2 });
      const { code } = await signUp(program.slug);

      const early = await redeem(program.urn, code).expect(409);
      expect(early.body.errorCode).toBe('LOYALTY_NOT_ENOUGH_STAMPS');

      await stampTimes(program.urn, code, 2);
      const responses = await Promise.all([redeem(program.urn, code), redeem(program.urn, code)]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect((await connection.collection('loyalty_members').findOne({ memberCode: code }))?.stamps).toBe(0);
    });

    it('un programa pausado no suma sellos', async () => {
      const program = await createProgram();
      const { code } = await signUp(program.slug);
      await http()
        .patch(`${base()}/programs/${program.urn}`)
        .set('Authorization', owner.auth)
        .send({ status: 'PAUSED' })
        .expect(200);

      const response = await stamp(program.urn, code).expect(409);
      expect(response.body.errorCode).toBe('LOYALTY_PROGRAM_PAUSED');
    });

    describe('deshacer', () => {
      const undo = (eventUrn: string) =>
        http().post(`${base()}/events/${eventUrn}/undo`).set('Authorization', cajero.auth);

      it('deshace el ultimo sello una sola vez, y se puede volver a sellar enseguida', async () => {
        const program = await createProgram();
        const { code } = await signUp(program.slug);
        const { body } = await stamp(program.urn, code).expect(201);

        const undone = await undo(body.event.urn).expect(200);
        expect(undone.body).toMatchObject({ stamps: 0, totalStamps: 0 });

        const twice = await undo(body.event.urn).expect(409);
        expect(twice.body.errorCode).toBe('LOYALTY_UNDO_NOT_ALLOWED');

        await stamp(program.urn, code).expect(201);
      });

      it('deshace un canje y devuelve los sellos', async () => {
        const program = await createProgram({ stampsRequired: 2 });
        const { code } = await signUp(program.slug);
        await stampTimes(program.urn, code, 2);
        const { body } = await redeem(program.urn, code).expect(201);

        const undone = await undo(body.event.urn).expect(200);
        expect(undone.body).toMatchObject({ stamps: 2, totalRedemptions: 0, rewardAvailable: true });
      });

      it('solo la ultima accion y dentro de la ventana', async () => {
        const program = await createProgram();
        const { code } = await signUp(program.slug);
        const first = await stamp(program.urn, code).expect(201);
        await skipCooldown(code);
        const second = await stamp(program.urn, code).expect(201);

        await undo(first.body.event.urn).expect(409);

        await connection
          .collection('loyalty_events')
          .updateOne({ urn: second.body.event.urn }, { $set: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
        await undo(second.body.event.urn).expect(409);
      });
    });

    it('lee el link actual sin cambiarlo, para mandarlo por WhatsApp', async () => {
      const program = await createProgram();
      const { token, code } = await signUp(program.slug);

      const { body } = await http()
        .get(`${base()}/members/${code}/card-link`)
        .set('Authorization', cajero.auth)
        .expect(200);

      expect(body.cardUrl).toBe(`https://app.opinara.test/card#token=${token}`);
      expect(body.pngDataUrl).toMatch(/^data:image\/png;base64,/);
      await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, token).expect(200);

      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Vecino' });
      await connection.collection('businesses').updateOne({ urn: otro.urn }, { $set: { plan: 'REVIEWS_LOYALTY' } });
      await http()
        .get(`/api/businesses/${otro.urn}/loyalty/members/${code}/card-link`)
        .set('Authorization', ajeno.auth)
        .expect(404);
    });

    it('genera un link nuevo y el anterior deja de andar', async () => {
      const program = await createProgram();
      const { token, code } = await signUp(program.slug);

      const { body } = await http()
        .post(`${base()}/members/${code}/card-link`)
        .set('Authorization', cajero.auth)
        .expect(200);

      const fresh = /#token=([A-Za-z0-9_-]+)$/.exec(body.cardUrl)?.[1] ?? '';
      expect(body.cardUrl).toMatch(/^https:\/\/app\.opinara\.test\/card#token=/);
      expect(body.pngDataUrl).toMatch(/^data:image\/png;base64,/);
      await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, token).expect(404);
      await http().get('/api/public/loyalty/card').set(TOKEN_HEADER, fresh).expect(200);
    });

    it('solo OWNER y ADMIN borran a un cliente', async () => {
      const program = await createProgram();
      const { code } = await signUp(program.slug);

      await http().delete(`${base()}/members/${code}`).set('Authorization', cajero.auth).expect(403);
      await http().delete(`${base()}/members/${code}`).set('Authorization', owner.auth).expect(204);
      await http().get(`${base()}/members/${code}`).set('Authorization', owner.auth).expect(404);
    });
  });
});
