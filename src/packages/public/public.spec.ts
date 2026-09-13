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

const GOOGLE_URL = 'https://search.google.com/local/writereview?placeid=ChIJfake555';

describe('Landing publica del QR (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let owner: TestUser;
  let businessUrn: string;
  let businessSlug: string;
  let locationUrn: string;
  let campaignUrn: string;

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
    const business = await createBusiness(app, owner, { name: 'Cafe de la Esquina' });
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
    const imported = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/locations/import`)
      .set('Authorization', owner.auth)
      .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
      .expect(201);
    locationUrn = imported.body[0].urn;

    const campaign = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/campaigns`)
      .set('Authorization', owner.auth)
      .send({ name: 'Mostrador', locationUrn })
      .expect(201);
    campaignUrn = campaign.body.urn;
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

  const landing = (business = businessSlug, campaign = 'mostrador') =>
    request(app.getHttpServer()).get(`/api/public/r/${business}/${campaign}`);

  const sendFeedback = (payload: Record<string, unknown>, business = businessSlug, campaign = 'mostrador') =>
    request(app.getHttpServer()).post(`/api/public/r/${business}/${campaign}/feedback`).send(payload);

  const campaignStats = async () => {
    const stored = await connection.collection('campaigns').findOne({ urn: campaignUrn });
    return stored?.stats as { scans: number; feedbacks: number; googleClicks: number };
  };

  describe('landing', () => {
    it('responde sin autenticacion y con la superficie minima', async () => {
      const response = await landing().expect(200);

      expect(response.body).toEqual({
        business: { name: 'Cafe de la Esquina' },
        location: { title: 'Sucursal Centro' },
        campaign: { name: 'Mostrador', slug: 'mostrador' },
        googleReviewUrl: GOOGLE_URL,
      });

      // Nada de identificadores internos ni datos del negocio.
      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain('urn:');
      expect(raw).not.toContain(businessUrn);
      expect(raw).not.toContain('placeId');
    });

    it('cuenta los escaneos', async () => {
      await landing().expect(200);
      await landing().expect(200);

      expect((await campaignStats()).scans).toBe(2);
    });

    it('responde 404 igual para negocio, campaña o slug inexistentes', async () => {
      const inexistente = await landing('negocio-que-no-existe', 'mostrador').expect(404);
      const campanaMala = await landing(businessSlug, 'campania-inexistente').expect(404);

      expect(inexistente.body.errorCode).toBe('CAMPAIGN_NOT_FOUND');
      expect(campanaMala.body.message).toBe(inexistente.body.message);
    });

    it('una campaña pausada deja de responder', async () => {
      await connection.collection('campaigns').updateOne({ urn: campaignUrn }, { $set: { status: 'PAUSED' } });

      await landing().expect(404);
    });

    it('un negocio suspendido deja de responder', async () => {
      await connection.collection('businesses').updateOne({ urn: businessUrn }, { $set: { status: 'SUSPENDED' } });

      await landing().expect(404);
    });

    it('si la location pierde el link de Google, la campaña deja de servir', async () => {
      await connection.collection('locations').updateOne({ urn: locationUrn }, { $unset: { newReviewUri: '' } });

      await landing().expect(404);
    });

    it('rechaza slugs con formato invalido sin tocar la base', async () => {
      await request(app.getHttpServer()).get('/api/public/r/Con%20Espacios/mostrador').expect(400);
      await request(app.getHttpServer()).get(`/api/public/r/${businessSlug}/..%2F..%2Fadmin`).expect(400);
    });
  });

  describe('envio de feedback', () => {
    it('guarda el feedback y devuelve el link de Google', async () => {
      const response = await sendFeedback({ rating: 5, comment: '  Excelente atencion  ' }).expect(201);

      expect(response.body).toEqual({ googleReviewUrl: GOOGLE_URL });

      const [stored] = await connection.collection('feedback').find({}).toArray();
      expect(stored).toMatchObject({
        businessUrn,
        locationUrn,
        campaignUrn,
        rating: 5,
        comment: 'Excelente atencion',
        source: 'QR',
      });
      expect((await campaignStats()).feedbacks).toBe(1);
    });

    it('devuelve el link de Google tambien con calificaciones bajas', async () => {
      // Decision de producto: mostrar el link solo a los clientes contentos es review
      // gating y viola la politica de contenido de Google.
      for (const rating of [1, 2, 3, 4, 5]) {
        const response = await sendFeedback({ rating }).expect(201);
        expect(response.body.googleReviewUrl).toBe(GOOGLE_URL);
      }

      expect(await connection.collection('feedback').countDocuments()).toBe(5);
    });

    it('no guarda datos personales del cliente', async () => {
      await sendFeedback({ rating: 4 }).set('User-Agent', 'Mozilla/5.0 (iPhone)').expect(201);

      const [stored] = await connection.collection('feedback').find({}).toArray();
      const raw = JSON.stringify(stored);
      expect(raw).not.toContain('iPhone');
      expect(raw).not.toContain('127.0.0.1');
      expect(stored).not.toHaveProperty('ip');
      expect(stored).not.toHaveProperty('userAgent');
    });

    it('valida el rating y el comentario', async () => {
      await sendFeedback({ rating: 0 }).expect(400);
      await sendFeedback({ rating: 6 }).expect(400);
      await sendFeedback({ rating: 'cinco' }).expect(400);
      await sendFeedback({}).expect(400);
      await sendFeedback({ rating: 5, comment: '   ' }).expect(400);
      await sendFeedback({ rating: 5, comment: 'x'.repeat(2001) }).expect(400);
      await sendFeedback({ rating: 5, businessUrn: 'urn:business:otro' }).expect(400);
    });

    it('no acepta feedback de una campaña pausada', async () => {
      await connection.collection('campaigns').updateOne({ urn: campaignUrn }, { $set: { status: 'PAUSED' } });

      await sendFeedback({ rating: 5 }).expect(404);
      expect(await connection.collection('feedback').countDocuments()).toBe(0);
    });
  });

  describe('click a Google', () => {
    it('cuenta el click', async () => {
      await request(app.getHttpServer()).post(`/api/public/r/${businessSlug}/mostrador/google-click`).expect(204);

      expect((await campaignStats()).googleClicks).toBe(1);
    });
  });

  describe('el negocio ve su feedback', () => {
    it('lista el feedback propio, paginado y filtrable', async () => {
      await sendFeedback({ rating: 5, comment: 'Excelente' }).expect(201);
      await sendFeedback({ rating: 2, comment: 'Demoraron' }).expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/feedback`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(response.body).toMatchObject({ total: 2, page: 0, limit: 20 });
      expect(response.body.items[0]).toMatchObject({ rating: 2, comment: 'Demoraron' });

      const filtrado = await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/feedback`)
        .query({ rating: 5 })
        .set('Authorization', owner.auth)
        .expect(200);
      expect(filtrado.body.total).toBe(1);
    });

    it('un negocio ajeno no ve el feedback', async () => {
      await sendFeedback({ rating: 5 }).expect(201);
      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Negocio Vecino' });

      await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/feedback`)
        .set('Authorization', ajeno.auth)
        .expect(404);

      const vacio = await request(app.getHttpServer())
        .get(`/api/businesses/${otro.urn}/feedback`)
        .set('Authorization', ajeno.auth)
        .expect(200);
      expect(vacio.body.total).toBe(0);
    });

    it('exige autenticacion', async () => {
      await request(app.getHttpServer()).get(`/api/businesses/${businessUrn}/feedback`).expect(401);
    });
  });
});
