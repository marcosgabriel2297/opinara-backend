import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import {
  GOOGLE_ACCOUNTS_ADAPTER,
  GOOGLE_LOCATIONS_ADAPTER,
  GOOGLE_OAUTH_ADAPTER,
  GOOGLE_REVIEWS_ADAPTER,
  GoogleApiError,
} from '@shared/integrations/google/exports';
import { createTestApp } from '../../../test/app.factory';
import {
  FakeGoogleAccountsAdapter,
  FakeGoogleLocationsAdapter,
  FakeGoogleOAuthAdapter,
  FakeGoogleReviewsAdapter,
  buildGoogleReview,
} from '../../../test/google.fakes';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';
import config from './config';

const day = (n: number): Date => new Date(`2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`);

describe('Sincronizacion de reviews (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let reviewsApi: FakeGoogleReviewsAdapter;
  let owner: TestUser;
  let businessUrn: string;
  let locationUrn: string;

  beforeAll(async () => {
    reviewsApi = new FakeGoogleReviewsAdapter();

    ({ app, connection, close } = await createTestApp({ REVIEW_SYNC_ENABLED: 'false' }, [
      { token: GOOGLE_OAUTH_ADAPTER, value: new FakeGoogleOAuthAdapter() },
      { token: GOOGLE_ACCOUNTS_ADAPTER, value: new FakeGoogleAccountsAdapter() },
      { token: GOOGLE_LOCATIONS_ADAPTER, value: new FakeGoogleLocationsAdapter() },
      { token: GOOGLE_REVIEWS_ADAPTER, value: reviewsApi },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    Object.assign(reviewsApi, { error: undefined, listCalls: 0, reviews: [], failLocationId: undefined });

    owner = await registerUser(app);
    const business = await createBusiness(app, owner, { name: `Negocio ${Date.now()}${Math.random()}` });
    businessUrn = business.urn;

    const { body } = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/connect`)
      .set('Authorization', owner.auth)
      .expect(201);
    const state = new URL(body.authorizationUrl).searchParams.get('state') ?? '';
    await request(app.getHttpServer())
      .get('/api/auth/google/callback')
      .query({ code: 'codigo-valido', state })
      .expect(200);

    const imported = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/locations/import`)
      .set('Authorization', owner.auth)
      .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
      .expect(201);
    locationUrn = imported.body[0].urn;
  });

  afterEach(async () => {
    await Promise.all(
      ['users', 'businesses', 'business_members', 'google_connections', 'oauth_states', 'locations', 'reviews'].map(
        (name) => connection.collection(name).deleteMany({}),
      ),
    );
  });

  const sync = (auth = owner.auth) =>
    request(app.getHttpServer()).post(`/api/businesses/${businessUrn}/google/sync`).set('Authorization', auth);

  const storedReviews = () => connection.collection('reviews').find({ businessUrn }).toArray();

  const location = () => connection.collection('locations').findOne({ urn: locationUrn });

  describe('primera corrida', () => {
    it('importa todo el historial y deja marcada la location', async () => {
      reviewsApi.reviews = [
        buildGoogleReview({ reviewId: 'r1', comment: 'Primera', updateTime: day(1), createTime: day(1) }),
        buildGoogleReview({ reviewId: 'r2', comment: 'Segunda', updateTime: day(2), createTime: day(2) }),
      ];

      const response = await sync().expect(200);

      expect(response.body).toMatchObject({ locations: 1, succeeded: 1, failed: 0 });
      expect(response.body.results[0]).toMatchObject({ locationUrn, imported: 2, updated: 0, deleted: 0, full: true });
      expect(await storedReviews()).toHaveLength(2);
      expect((await location())?.lastReviewSyncAt).toBeInstanceOf(Date);
    });

    it('recorre todas las paginas respetando el tope de 50 por pagina', async () => {
      reviewsApi.reviews = Array.from({ length: 120 }, (_, index) =>
        buildGoogleReview({
          reviewId: `r${index}`,
          comment: `Reseña ${index}`,
          updateTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
          createTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
        }),
      );

      const response = await sync().expect(200);

      expect(response.body.results[0]).toMatchObject({ imported: 120, pages: 3 });
      expect(reviewsApi.lastOptions).toMatchObject({ pageSize: 50, orderBy: 'updateTime desc' });
      expect(await storedReviews()).toHaveLength(120);
    });

    it('guarda los datos de la reseña tal como los da Google', async () => {
      reviewsApi.reviews = [
        buildGoogleReview({
          reviewId: 'r1',
          starRating: 2,
          starRatingRaw: 'TWO',
          comment: 'Podrian mejorar',
          reviewer: { isAnonymous: true },
          createTime: day(1),
          updateTime: day(3),
          reply: { comment: 'Gracias por avisarnos', updateTime: day(4) },
        }),
      ];

      await sync().expect(200);

      const [stored] = await storedReviews();
      expect(stored).toMatchObject({
        googleReviewId: 'r1',
        starRating: 2,
        starRatingRaw: 'TWO',
        comment: 'Podrian mejorar',
        reviewer: { isAnonymous: true },
        reply: { comment: 'Gracias por avisarnos' },
      });
      expect(stored.googleCreateTime).toEqual(day(1));
      expect(stored.googleUpdateTime).toEqual(day(3));
    });
  });

  describe('corridas incrementales', () => {
    it('no duplica y corta al llegar a lo ya sincronizado', async () => {
      reviewsApi.reviews = [buildGoogleReview({ reviewId: 'r1', updateTime: day(1), createTime: day(1) })];
      await sync().expect(200);

      // Una reseña nueva y una vieja sin cambios.
      reviewsApi.reviews.push(
        buildGoogleReview({ reviewId: 'r2', comment: 'Nueva', updateTime: new Date(), createTime: new Date() }),
      );
      reviewsApi.listCalls = 0;

      const response = await sync().expect(200);

      expect(response.body.results[0]).toMatchObject({ imported: 1, updated: 0, full: false });
      expect(await storedReviews()).toHaveLength(2);
      // Corto en la primera pagina en vez de recorrer el historial entero.
      expect(reviewsApi.listCalls).toBe(1);
    });

    it('actualiza una reseña editada por su autor', async () => {
      const original = buildGoogleReview({
        reviewId: 'r1',
        comment: 'Estuvo bien',
        updateTime: day(1),
        createTime: day(1),
      });
      reviewsApi.reviews = [original];
      await sync().expect(200);

      reviewsApi.reviews = [
        { ...original, comment: 'Lo pense mejor: estuvo excelente', starRating: 5, updateTime: new Date() },
      ];
      const response = await sync().expect(200);

      expect(response.body.results[0]).toMatchObject({ imported: 0, updated: 1, unchanged: 0 });
      const [stored] = await storedReviews();
      expect(stored.comment).toBe('Lo pense mejor: estuvo excelente');
      expect(await connection.collection('reviews').countDocuments({ businessUrn })).toBe(1);
    });

    it('reprocesa la ventana de solapamiento sin duplicar', async () => {
      reviewsApi.reviews = [buildGoogleReview({ reviewId: 'r1', updateTime: new Date(), createTime: new Date() })];
      await sync().expect(200);

      // La misma reseña cae dentro del solapamiento: se vuelve a ver, pero como update.
      const response = await sync().expect(200);

      expect(response.body.results[0]).toMatchObject({ imported: 0, updated: 0, unchanged: 1 });
      expect(await storedReviews()).toHaveLength(1);
    });
  });

  describe('reseñas borradas en Google', () => {
    it('las marca como borradas solo en una corrida completa', async () => {
      reviewsApi.reviews = [
        buildGoogleReview({ reviewId: 'r1', updateTime: day(1), createTime: day(1) }),
        buildGoogleReview({ reviewId: 'r2', updateTime: day(2), createTime: day(2) }),
      ];
      await sync().expect(200);

      // El autor borra r1 y aparece una reseña nueva.
      reviewsApi.reviews = [
        buildGoogleReview({ reviewId: 'r2', updateTime: day(2), createTime: day(2) }),
        buildGoogleReview({ reviewId: 'r3', updateTime: new Date(), createTime: new Date() }),
      ];

      // La incremental no ve el historial completo: no puede concluir que r1 fue borrada.
      const incremental = await sync().expect(200);
      expect(incremental.body.results[0]).toMatchObject({ deleted: 0, full: false });
      expect(await connection.collection('reviews').countDocuments({ deletedAt: { $exists: true } })).toBe(0);

      // Una corrida completa si.
      await connection.collection('locations').updateOne({ urn: locationUrn }, { $unset: { lastReviewSyncAt: '' } });
      const full = await sync().expect(200);
      expect(full.body.results[0]).toMatchObject({ deleted: 1, full: true });

      const borrada = await connection.collection('reviews').findOne({ googleReviewId: 'r1' });
      expect(borrada?.deletedAt).toBeInstanceOf(Date);

      // Y deja de aparecer en el listado del dashboard.
      const listado = await request(app.getHttpServer())
        .get(`/api/businesses/${businessUrn}/locations/${locationUrn}/reviews`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(listado.body.total).toBe(2);
    });
  });

  describe('errores', () => {
    it('si Google falla no avanza el marcador: la proxima corrida reintenta', async () => {
      reviewsApi.reviews = [buildGoogleReview({ reviewId: 'r1', updateTime: day(1), createTime: day(1) })];
      await sync().expect(200);
      const marcaPrevia = (await location())?.lastReviewSyncAt;

      reviewsApi.error = new GoogleApiError(503, 'UNAVAILABLE', 'reviews.list');
      const response = await sync().expect(503);
      expect(response.body.errorCode).toBe('GOOGLE_UNAVAILABLE');

      expect((await location())?.lastReviewSyncAt).toEqual(marcaPrevia);
    });

    it('traduce el 429 de cuota agotada', async () => {
      reviewsApi.error = new GoogleApiError(429, 'RESOURCE_EXHAUSTED', 'reviews.list');

      const response = await sync().expect(503);

      expect(response.body.errorCode).toBe('GOOGLE_RATE_LIMITED');
      expect(JSON.stringify(response.body)).not.toContain('RESOURCE_EXHAUSTED');
    });

    it('exige conexion de Google', async () => {
      await connection.collection('google_connections').deleteMany({});

      const response = await sync().expect(404);

      expect(response.body.errorCode).toBe('GOOGLE_CONNECTION_NOT_FOUND');
    });
  });

  describe('autorizacion', () => {
    it('solo OWNER o ADMIN pueden disparar la sincronizacion', async () => {
      const miembro = await registerUser(app);
      await connection.collection('business_members').insertOne({
        urn: 'urn:business-member:miembro-sync',
        businessUrn,
        userUrn: miembro.urn,
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      const response = await sync(miembro.auth).expect(403);
      expect(response.body.errorCode).toBe('BUSINESS_FORBIDDEN');
    });

    it('un usuario ajeno recibe 404 y no dispara ninguna llamada a Google', async () => {
      const ajeno = await registerUser(app);
      reviewsApi.listCalls = 0;

      await sync(ajeno.auth).expect(404);

      expect(reviewsApi.listCalls).toBe(0);
    });
  });

  describe('robustez', () => {
    it('sincronizaciones concurrentes no duplican ni rompen', async () => {
      reviewsApi.reviews = Array.from({ length: 30 }, (_, index) =>
        buildGoogleReview({
          reviewId: `r${index}`,
          comment: `Reseña ${index}`,
          updateTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
          createTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
        }),
      );

      const responses = await Promise.all([sync(), sync(), sync(), sync()]);

      // Ninguna corrida puede terminar en 500 por chocar con el indice unico.
      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
      expect(await storedReviews()).toHaveLength(30);
    });

    it('si se corta por el tope de paginas no avanza el marcador ni marca borrados', async () => {
      reviewsApi.reviews = Array.from({ length: 120 }, (_, index) =>
        buildGoogleReview({
          reviewId: `r${index}`,
          updateTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
          createTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
        }),
      );

      const original = config.Sync.MaxPages;
      config.Sync.MaxPages = 1;

      try {
        const response = await sync().expect(200);

        expect(response.body.results[0]).toMatchObject({ imported: 50, pages: 1, truncated: true, deleted: 0 });

        // Sin marcador, la proxima corrida vuelve a ser completa: las 70 restantes no se pierden.
        const stored = await connection.collection('locations').findOne({ urn: locationUrn });
        expect(stored?.lastReviewSyncAt).toBeUndefined();
      } finally {
        config.Sync.MaxPages = original;
      }
    });

    it('una corrida truncada no concluye que falten reseñas borradas', async () => {
      reviewsApi.reviews = Array.from({ length: 120 }, (_, index) =>
        buildGoogleReview({
          reviewId: `r${index}`,
          updateTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
          createTime: new Date(Date.UTC(2026, 8, 1, 0, index)),
        }),
      );
      await sync().expect(200);
      expect(await storedReviews()).toHaveLength(120);

      const original = config.Sync.MaxPages;
      config.Sync.MaxPages = 1;

      try {
        // Corrida completa que solo alcanza a ver las 50 mas nuevas.
        await connection.collection('locations').updateOne({ urn: locationUrn }, { $unset: { lastReviewSyncAt: '' } });
        const response = await sync().expect(200);

        expect(response.body.results[0]).toMatchObject({ truncated: true, deleted: 0 });
        // Las 70 que no llego a ver siguen visibles: no fueron borradas en Google.
        expect(await connection.collection('reviews').countDocuments({ deletedAt: { $exists: true } })).toBe(0);
      } finally {
        config.Sync.MaxPages = original;
      }
    });
  });

  describe('por location', () => {
    it('permite sincronizar una sola sucursal', async () => {
      reviewsApi.reviews = [buildGoogleReview({ reviewId: 'r1', updateTime: day(1), createTime: day(1) })];

      const response = await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/locations/${locationUrn}/reviews/sync`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(response.body).toMatchObject({ locationUrn, imported: 1, full: true });
    });

    it('informa las locations que fallan sin descartar las que sincronizaron', async () => {
      // Segunda sucursal cuyo id de Google la API rechaza.
      await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/google/locations/import`)
        .set('Authorization', owner.auth)
        .send({ accountName: 'accounts/111', locationNames: ['locations/666'] })
        .expect(201);

      reviewsApi.reviews = [buildGoogleReview({ reviewId: 'r1', updateTime: day(1), createTime: day(1) })];
      reviewsApi.failLocationId = '666';

      const response = await sync().expect(200);

      expect(response.body).toMatchObject({ locations: 2, succeeded: 1, failed: 1 });
      expect(response.body.failures[0]).toMatchObject({ errorCode: 'GOOGLE_PERMISSION_DENIED' });
      // Lo que si se pudo sincronizar quedo guardado.
      expect(await storedReviews()).toHaveLength(1);
    });

    it('si ninguna location sincroniza, el error se propaga', async () => {
      reviewsApi.failLocationId = '555';

      const response = await sync().expect(403);

      expect(response.body.errorCode).toBe('GOOGLE_PERMISSION_DENIED');
    });

    it('rechaza una location que no es del business', async () => {
      const ajeno = await registerUser(app);
      const otro = await createBusiness(app, ajeno, { name: 'Negocio Vecino' });

      await request(app.getHttpServer())
        .post(`/api/businesses/${otro.urn}/locations/${locationUrn}/reviews/sync`)
        .set('Authorization', ajeno.auth)
        .expect(404);
    });
  });
});
