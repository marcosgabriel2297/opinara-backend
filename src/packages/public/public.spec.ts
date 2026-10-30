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
const UNAVAILABLE_URL = 'https://app.opinara.test/r/no-disponible';

describe('QR publico: redireccion a Google (integracion)', () => {
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
      ].map((name) => connection.collection(name).deleteMany({})),
    );
  });

  const scan = (business = businessSlug, campaign = 'mostrador') =>
    request(app.getHttpServer()).get(`/api/public/r/${business}/${campaign}`).redirects(0);

  const campaignStats = async () => {
    const stored = await connection.collection('campaigns').findOne({ urn: campaignUrn });
    return stored?.stats as { scans: number; googleClicks: number };
  };

  describe('escaneo del QR', () => {
    it('redirige directo a Google, sin autenticacion y sin cuerpo con datos', async () => {
      const response = await scan().expect(302);

      expect(response.headers.location).toBe(GOOGLE_URL);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');

      const raw = JSON.stringify(response.headers) + response.text;
      expect(raw).not.toContain('urn:');
      expect(raw).not.toContain(businessUrn);
    });

    it('cada escaneo cuenta como escaneo y como envio a Google, en la misma operacion', async () => {
      await scan().expect(302);
      await scan().expect(302);

      expect(await campaignStats()).toEqual({ scans: 2, googleClicks: 2 });
    });

    it('no pisa las metricas historicas: suma sobre lo que ya habia', async () => {
      await connection
        .collection('campaigns')
        .updateOne({ urn: campaignUrn }, { $set: { stats: { scans: 120, googleClicks: 41 } } });

      await scan().expect(302);

      expect(await campaignStats()).toEqual({ scans: 121, googleClicks: 42 });
    });

    it('escaneos concurrentes no pierden cuentas', async () => {
      // Un solo servidor escuchando: si supertest levanta uno efimero por pedido, 20 a la vez
      // terminan en ECONNRESET y el test mediria el harness, no el contador.
      const url = await app.listen(0).then(() => app.getUrl());
      const target = `${url.replace('[::1]', 'localhost')}/api/public/r/${businessSlug}/mostrador`;

      const statuses = await Promise.all(
        Array.from({ length: 20 }, () => fetch(target, { redirect: 'manual' }).then((response) => response.status)),
      );

      expect(statuses).toEqual(Array<number>(20).fill(302));

      expect(await campaignStats()).toEqual({ scans: 20, googleClicks: 20 });
    });

    it('un HEAD (previsualizadores, bots) redirige igual pero no cuenta', async () => {
      const response = await request(app.getHttpServer())
        .head(`/api/public/r/${businessSlug}/mostrador`)
        .redirects(0)
        .expect(302);

      expect(response.headers.location).toBe(GOOGLE_URL);
      expect(await campaignStats()).toEqual({ scans: 0, googleClicks: 0 });
    });

    it('todo QR que no sirve va a la misma pagina de "no disponible"', async () => {
      const inexistente = await scan('negocio-que-no-existe', 'mostrador').expect(302);
      const campanaMala = await scan(businessSlug, 'campania-inexistente').expect(302);

      expect(inexistente.headers.location).toBe(UNAVAILABLE_URL);
      expect(campanaMala.headers.location).toBe(UNAVAILABLE_URL);
    });

    it('una campaña pausada deja de redirigir a Google y no cuenta', async () => {
      await connection.collection('campaigns').updateOne({ urn: campaignUrn }, { $set: { status: 'PAUSED' } });

      expect((await scan().expect(302)).headers.location).toBe(UNAVAILABLE_URL);
      expect((await campaignStats()).scans).toBe(0);
    });

    it('un negocio suspendido deja de redirigir a Google', async () => {
      await connection.collection('businesses').updateOne({ urn: businessUrn }, { $set: { status: 'SUSPENDED' } });

      expect((await scan().expect(302)).headers.location).toBe(UNAVAILABLE_URL);
    });

    it('si la location pierde el link de Google, la campaña deja de servir', async () => {
      await connection.collection('locations').updateOne({ urn: locationUrn }, { $unset: { newReviewUri: '' } });

      expect((await scan().expect(302)).headers.location).toBe(UNAVAILABLE_URL);
    });

    it('rechaza slugs con formato invalido sin tocar la base', async () => {
      await request(app.getHttpServer()).get('/api/public/r/Con%20Espacios/mostrador').expect(400);
      await request(app.getHttpServer()).get(`/api/public/r/${businessSlug}/..%2F..%2Fadmin`).expect(400);
    });

    it('el formulario propio y el click a Google ya no existen', async () => {
      await request(app.getHttpServer())
        .post(`/api/public/r/${businessSlug}/mostrador/feedback`)
        .send({ rating: 5 })
        .expect(404);
      await request(app.getHttpServer()).post(`/api/public/r/${businessSlug}/mostrador/google-click`).expect(404);
    });
  });

  describe('opiniones internas', () => {
    it('ya no existen: ni el listado ni el contador en la campaña', async () => {
      await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/feedback`)
        .set('Authorization', owner.auth)
        .expect(404);

      // Una campaña vieja con el contador guardado no lo devuelve.
      await connection
        .collection('campaigns')
        .updateOne({ urn: campaignUrn }, { $set: { stats: { scans: 7, feedbacks: 2, googleClicks: 2 } } });

      const { body } = await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/campaigns/${campaignUrn}`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(body.stats).toEqual({ scans: 7, googleClicks: 2 });
    });
  });
});
