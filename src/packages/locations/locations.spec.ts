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

/**
 * Alta manual de sucursales: la via para operar el QR antes de que Google apruebe el
 * acceso a las APIs. Lo que se prueba es que sirva para campañas, que no se sincronice
 * contra Google y que la importacion posterior la adopte en vez de duplicarla.
 */
describe('Alta manual de sucursales (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let owner: TestUser;
  let businessUrn: string;
  let businessSlug: string;

  /** El mismo placeId que devuelve el doble de Google para `locations/555`. */
  const PLACE_ID = 'ChIJfake555';

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
        'reviews',
      ].map((name) => connection.collection(name).deleteMany({})),
    );
  });

  const create = (payload: Record<string, unknown>, auth = owner.auth) =>
    request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/locations`)
      .set('Authorization', auth)
      .send(payload);

  /** Conecta Google e importa `locations/555`, que comparte placeId con el alta manual. */
  const importFromGoogle = async () => {
    const { body } = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/connect`)
      .set('Authorization', owner.auth)
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/auth/google/callback')
      .query({ code: 'codigo-valido', state: new URL(body.authorizationUrl).searchParams.get('state') ?? '' })
      .expect(200);

    return request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/locations/import`)
      .set('Authorization', owner.auth)
      .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
      .expect(201);
  };

  describe('creacion', () => {
    it('crea la sucursal con el link de reseña derivado del placeId', async () => {
      const response = await create({ title: '  Sucursal Centro  ', placeId: PLACE_ID, address: 'Corrientes 1234' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        title: 'Sucursal Centro',
        placeId: PLACE_ID,
        address: 'Corrientes 1234',
        source: 'MANUAL',
        hasVoiceOfMerchant: false,
        isActive: true,
        googleReviewUrl: `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
        mapsUri: `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`,
      });
      expect(response.body.urn).toMatch(/^urn:location:/);
    });

    it('la sucursal manual sirve para una campaña y su QR publico', async () => {
      const { body: location } = await create({ title: 'Mostrador', placeId: PLACE_ID }).expect(201);

      const { body: campaign } = await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/campaigns`)
        .set('Authorization', owner.auth)
        .send({ name: 'Mostrador Principal', locationUrn: location.urn })
        .expect(201);

      const scan = await request(app.getHttpServer())
        .get(`/api/public/r/${businessSlug}/${campaign.slug}`)
        .redirects(0)
        .expect(302);

      expect(scan.headers.location).toBe(`https://search.google.com/local/writereview?placeid=${PLACE_ID}`);
    });

    it('rechaza un placeId con formato invalido', async () => {
      await create({ title: 'Sucursal', placeId: 'no es un place id' }).expect(400);
    });

    it('rechaza el mismo local dos veces', async () => {
      await create({ title: 'Centro', placeId: PLACE_ID }).expect(201);

      const response = await create({ title: 'Centro otra vez', placeId: PLACE_ID }).expect(409);
      expect(response.body.errorCode).toBe('LOCATION_ALREADY_IMPORTED');
    });

    it('un MEMBER no puede dar de alta sucursales', async () => {
      const invitado = await registerUser(app);
      await connection.collection('business_members').insertOne({
        urn: 'urn:business-member:invitado-locations',
        businessUrn,
        userUrn: invitado.urn,
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      const response = await create({ title: 'Ajena', placeId: PLACE_ID }, invitado.auth).expect(403);
      expect(response.body.errorCode).toBe('BUSINESS_FORBIDDEN');
    });

    it('un usuario de otro negocio recibe 404 y no crea nada', async () => {
      const ajeno = await registerUser(app);

      await create({ title: 'Robada', placeId: PLACE_ID }, ajeno.auth).expect(404);
      expect(await connection.collection('locations').countDocuments()).toBe(0);
    });
  });

  describe('relacion con Google', () => {
    it('no se sincroniza: responde 400 sin llamar a Google', async () => {
      const { body: location } = await create({ title: 'Mostrador', placeId: PLACE_ID }).expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/locations/${location.urn}/reviews/sync`)
        .set('Authorization', owner.auth)
        .expect(400);

      expect(response.body.errorCode).toBe('LOCATION_NOT_SYNCABLE');
    });

    it('una location anterior al campo source se sigue sincronizando y se informa como GOOGLE', async () => {
      await importFromGoogle();
      // Como quedaron las locations importadas antes de que existiera `source`.
      await connection.collection('locations').updateMany({}, { $unset: { source: '' } });

      const listado = await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/locations`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(listado.body[0].source).toBe('GOOGLE');

      const response = await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/google/sync`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(response.body).toMatchObject({ locations: 1, succeeded: 1, failed: 0 });
    });

    it('la importacion la adopta por placeId: conserva el urn y las campañas', async () => {
      const { body: manual } = await create({ title: 'Mostrador', placeId: PLACE_ID }).expect(201);

      const { body: campaign } = await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/campaigns`)
        .set('Authorization', owner.auth)
        .send({ name: 'Mostrador Principal', locationUrn: manual.urn })
        .expect(201);

      const imported = await importFromGoogle();

      expect(imported.body).toHaveLength(1);
      expect(imported.body[0].urn).toBe(manual.urn);
      expect(imported.body[0].source).toBe('GOOGLE');
      expect(await connection.collection('locations').countDocuments()).toBe(1);

      // El QR impreso sigue resolviendo, ahora contra la sucursal real de Google.
      const scan = await request(app.getHttpServer())
        .get(`/api/public/r/${businessSlug}/${campaign.slug}`)
        .redirects(0)
        .expect(302);
      expect(scan.headers.location).toBe(imported.body[0].googleReviewUrl);

      // Y ya es sincronizable.
      await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/locations/${manual.urn}/reviews/sync`)
        .set('Authorization', owner.auth)
        .expect(200);
    });
  });
});
