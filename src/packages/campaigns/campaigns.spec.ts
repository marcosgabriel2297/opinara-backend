import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import {
  GOOGLE_ACCOUNTS_ADAPTER,
  GOOGLE_LOCATIONS_ADAPTER,
  GOOGLE_OAUTH_ADAPTER,
  GOOGLE_REVIEWS_ADAPTER,
} from '@shared/integrations/google/exports';
import { createTestApp } from '../../../test/app.factory';
import {
  FakeGoogleAccountsAdapter,
  FakeGoogleLocationsAdapter,
  FakeGoogleOAuthAdapter,
  FakeGoogleReviewsAdapter,
} from '../../../test/google.fakes';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';

describe('Campañas y QR (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let owner: TestUser;
  let businessUrn: string;
  let businessSlug: string;
  let locationUrn: string;
  /** Sucursal sin link de Google: no puede usarse en campañas. */
  let sinLinkUrn: string;

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp({ PUBLIC_APP_BASE_URL: 'https://app.opinara.test' }, [
      { token: GOOGLE_OAUTH_ADAPTER, value: new FakeGoogleOAuthAdapter() },
      { token: GOOGLE_ACCOUNTS_ADAPTER, value: new FakeGoogleAccountsAdapter() },
      { token: GOOGLE_LOCATIONS_ADAPTER, value: new FakeGoogleLocationsAdapter() },
      { token: GOOGLE_REVIEWS_ADAPTER, value: new FakeGoogleReviewsAdapter() },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    owner = await registerUser(app);
    const business = await createBusiness(app, owner, { name: `Cafe ${Date.now()}${Math.random()}` });
    businessUrn = business.urn;
    businessSlug = business.slug;

    const { body } = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/connect`)
      .set('Authorization', owner.auth)
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/auth/google/callback')
      .query({ code: 'codigo-valido', state: new URL(body.authorizationUrl).searchParams.get('state') ?? '' })
      .expect(200);

    // locations/555 tiene newReviewUri; locations/666 no.
    const imported = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/locations/import`)
      .set('Authorization', owner.auth)
      .send({ accountName: 'accounts/111', locationNames: ['locations/555', 'locations/666'] })
      .expect(201);
    locationUrn = imported.body[0].urn;
    sinLinkUrn = imported.body[1].urn;
  });

  afterEach(async () => {
    await Promise.all(
      [
        'users',
        'businesses',
        'business_members',
        'google_connections',
        'oauth_states',
        'locations',
        'campaigns',
        'qr_codes',
        'feedback',
      ].map((name) => connection.collection(name).deleteMany({})),
    );
  });

  const create = (payload: Record<string, unknown>, auth = owner.auth) =>
    request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/campaigns`)
      .set('Authorization', auth)
      .send(payload);

  describe('creacion', () => {
    it('crea la campaña con su URL publica y contadores en cero', async () => {
      const response = await create({ name: 'Mostrador Principal', locationUrn }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Mostrador Principal',
        slug: 'mostrador-principal',
        locationUrn,
        status: 'ACTIVE',
        stats: { scans: 0, feedbacks: 0, googleClicks: 0 },
        targetUrl: `https://app.opinara.test/r/${businessSlug}/mostrador-principal`,
      });
    });

    it('rechaza una location sin link de Google', async () => {
      const response = await create({ name: 'Sin Link', locationUrn: sinLinkUrn }).expect(400);

      expect(response.body.errorCode).toBe('LOCATION_NOT_REVIEWABLE');
    });

    it('rechaza una location de otro negocio', async () => {
      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Negocio Vecino' });

      await request(app.getHttpServer())
        .post(`/api/businesses/${otro.urn}/campaigns`)
        .set('Authorization', ajeno.auth)
        .send({ name: 'Robada', locationUrn })
        .expect(404);
    });

    it('el slug es unico dentro del negocio, incluso con altas concurrentes', async () => {
      await create({ name: 'Mostrador', locationUrn }).expect(201);
      const repetido = await create({ name: 'Mostrador', locationUrn }).expect(409);
      expect(repetido.body.errorCode).toBe('CAMPAIGN_SLUG_ALREADY_EXISTS');

      const concurrentes = await Promise.all([
        create({ name: 'Vidriera', locationUrn }),
        create({ name: 'Vidriera', locationUrn }),
        create({ name: 'Vidriera', locationUrn }),
      ]);
      expect(concurrentes.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    it('el mismo slug puede repetirse en otro negocio', async () => {
      await create({ name: 'Mostrador', locationUrn }).expect(201);

      const otroDueno = await registerUser(app);
      const otro = await createBusiness(app, otroDueno, { name: 'Bar Vecino' });
      const { body } = await request(app.getHttpServer())
        .post(`/api/businesses/${otro.urn}/google/connect`)
        .set('Authorization', otroDueno.auth)
        .expect(201);
      await request(app.getHttpServer())
        .get('/api/auth/google/callback')
        .query({ code: 'codigo-valido', state: new URL(body.authorizationUrl).searchParams.get('state') ?? '' })
        .expect(200);
      const imported = await request(app.getHttpServer())
        .post(`/api/businesses/${otro.urn}/google/locations/import`)
        .set('Authorization', otroDueno.auth)
        .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/businesses/${otro.urn}/campaigns`)
        .set('Authorization', otroDueno.auth)
        .send({ name: 'Mostrador', locationUrn: imported.body[0].urn })
        .expect(201);
    });

    it('pide un slug explicito cuando del nombre no sale ninguno', async () => {
      // Un nombre solo con emoji o simbolos no produce slug: el error tiene que decir eso,
      // no que el slug ya esta tomado.
      const soloEmoji = await create({ name: '🍕🍕🍕', locationUrn }).expect(400);
      expect(soloEmoji.body.errorCode).toBe('SLUG_NOT_DERIVABLE');

      // Con un slug explicito, el mismo nombre funciona.
      const conSlug = await create({ name: '🍕🍕🍕', locationUrn, slug: 'pizzeria' }).expect(201);
      expect(conSlug.body.slug).toBe('pizzeria');
    });

    it('normaliza acentos y simbolos al derivar el slug', async () => {
      const response = await create({ name: '  Café & Té — 2x1  ', locationUrn }).expect(201);

      expect(response.body).toMatchObject({ name: 'Café & Té — 2x1', slug: 'cafe-te-2x1' });
    });

    it('valida el payload', async () => {
      await create({ name: 'A', locationUrn }).expect(400);
      // El nombre se recorta antes de validar: no alcanza con mandar espacios.
      await create({ name: '   ', locationUrn }).expect(400);
      await create({ name: 'Valida', locationUrn: 'no-es-urn' }).expect(400);
      await create({ name: 'Valida', locationUrn, slug: 'Con Mayusculas' }).expect(400);
      await create({ name: 'Valida', locationUrn, status: 'ACTIVE' }).expect(400);
    });

    it('solo OWNER o ADMIN pueden crear campañas', async () => {
      const miembro = await registerUser(app);
      await connection.collection('business_members').insertOne({
        urn: 'urn:business-member:miembro-campanas',
        businessUrn,
        userUrn: miembro.urn,
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      await create({ name: 'Del miembro', locationUrn }, miembro.auth).expect(403);
    });
  });

  describe('QR', () => {
    it('genera un PNG con la URL de la campaña', async () => {
      const campaign = await create({ name: 'Mostrador', locationUrn }).expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/campaigns/${campaign.body.urn}/qr`)
        .set('Authorization', owner.auth)
        .expect(201);

      expect(response.body.targetUrl).toBe(`https://app.opinara.test/r/${businessSlug}/mostrador`);
      expect(response.body.pngDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(response.body.pngDataUrl.length).toBeGreaterThan(500);
    });

    it('regenerar no duplica el registro del QR', async () => {
      const campaign = await create({ name: 'Mostrador', locationUrn }).expect(201);
      const qr = () =>
        request(app.getHttpServer())
          .post(`/api/businesses/${businessUrn}/campaigns/${campaign.body.urn}/qr`)
          .set('Authorization', owner.auth)
          .expect(201);

      await qr();
      await qr();

      expect(await connection.collection('qr_codes').countDocuments({ campaignUrn: campaign.body.urn })).toBe(1);
    });

    it('no genera el QR de una campaña ajena', async () => {
      const campaign = await create({ name: 'Mostrador', locationUrn }).expect(201);
      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Negocio Vecino' });

      await request(app.getHttpServer())
        .post(`/api/businesses/${otro.urn}/campaigns/${campaign.body.urn}/qr`)
        .set('Authorization', ajeno.auth)
        .expect(404);
    });
  });

  describe('listado', () => {
    it('solo devuelve las campañas del negocio', async () => {
      await create({ name: 'Mostrador', locationUrn }).expect(201);
      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Negocio Vecino' });

      const propias = await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/campaigns`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(propias.body).toHaveLength(1);

      const ajenas = await request(app.getHttpServer())
        .get(`/api/businesses/${otro.urn}/campaigns`)
        .set('Authorization', ajeno.auth)
        .expect(200);
      expect(ajenas.body).toHaveLength(0);
    });
  });
});
