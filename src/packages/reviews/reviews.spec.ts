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
} from '../../../test/google.fakes';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';
import { MAX_REPLY_LENGTH } from './dtos';

const REVIEW_URN = 'urn:review:aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_REVIEW_URN = 'urn:review:aaaaaaaa-0000-4000-8000-000000000002';

describe('Reviews (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let oauth: FakeGoogleOAuthAdapter;
  let reviewsApi: FakeGoogleReviewsAdapter;
  let owner: TestUser;
  let businessUrn: string;
  let locationUrn: string;

  beforeAll(async () => {
    oauth = new FakeGoogleOAuthAdapter();
    reviewsApi = new FakeGoogleReviewsAdapter();

    ({ app, connection, close } = await createTestApp({}, [
      { token: GOOGLE_OAUTH_ADAPTER, value: oauth },
      { token: GOOGLE_ACCOUNTS_ADAPTER, value: new FakeGoogleAccountsAdapter() },
      { token: GOOGLE_LOCATIONS_ADAPTER, value: new FakeGoogleLocationsAdapter() },
      { token: GOOGLE_REVIEWS_ADAPTER, value: reviewsApi },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  /** Deja un business con conexion activa, una location importada y una review sincronizada. */
  const seedReview = async (overrides: Record<string, unknown> = {}, urn: string = REVIEW_URN) => {
    await connection.collection('reviews').insertOne({
      urn,
      businessUrn,
      locationUrn,
      googleReviewId: `google-${urn}`,
      googleReviewName: `accounts/111/locations/555/reviews/google-${urn}`,
      starRating: 5,
      starRatingRaw: 'FIVE',
      comment: 'Excelente atencion',
      reviewer: { displayName: 'Ana Perez', isAnonymous: false },
      googleCreateTime: new Date('2026-09-01T10:00:00.000Z'),
      googleUpdateTime: new Date('2026-09-01T10:00:00.000Z'),
      syncedAt: new Date(),
      ...overrides,
    });
  };

  beforeEach(async () => {
    Object.assign(reviewsApi, { error: undefined, deleteError: undefined, deletedReplies: [] });
    reviewsApi.replies.clear();

    owner = await registerUser(app);
    const business = await createBusiness(app, owner, { name: `Negocio ${Date.now()}${Math.random()}` });
    businessUrn = business.urn;

    // Conexion de Google y location importada, ya validadas en la fase 3.
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

  const path = (suffix = '') => `/api/businesses/${businessUrn}/locations/${locationUrn}/reviews${suffix}`;

  describe('listado', () => {
    it('devuelve las reseñas paginadas, mas nuevas primero', async () => {
      await seedReview({ googleUpdateTime: new Date('2026-09-01T10:00:00.000Z') });
      await seedReview(
        { googleUpdateTime: new Date('2026-09-05T10:00:00.000Z'), comment: 'Mas reciente', starRating: 3 },
        OTHER_REVIEW_URN,
      );

      const response = await request(app.getHttpServer()).get(path()).set('Authorization', owner.auth).expect(200);

      expect(response.body).toMatchObject({ page: 0, limit: 20, total: 2 });
      expect(response.body.items.map((review: { comment: string }) => review.comment)).toEqual([
        'Mas reciente',
        'Excelente atencion',
      ]);
      expect(response.body.items[0]).toMatchObject({
        rating: 3,
        reviewer: { displayName: 'Ana Perez', isAnonymous: false },
      });
    });

    it('filtra por rating y por si tienen respuesta', async () => {
      await seedReview({ starRating: 5 });
      await seedReview({ starRating: 1, reply: { comment: 'Lamentamos lo ocurrido' } }, OTHER_REVIEW_URN);

      const porRating = await request(app.getHttpServer())
        .get(path())
        .query({ rating: 1 })
        .set('Authorization', owner.auth)
        .expect(200);
      expect(porRating.body.total).toBe(1);
      expect(porRating.body.items[0].rating).toBe(1);

      const sinResponder = await request(app.getHttpServer())
        .get(path())
        .query({ hasReply: 'false' })
        .set('Authorization', owner.auth)
        .expect(200);
      expect(sinResponder.body.total).toBe(1);
      expect(sinResponder.body.items[0].reply).toBeUndefined();
    });

    it('valida los parametros de paginacion', async () => {
      await request(app.getHttpServer()).get(path()).query({ limit: 500 }).set('Authorization', owner.auth).expect(400);
      await request(app.getHttpServer()).get(path()).query({ rating: 9 }).set('Authorization', owner.auth).expect(400);
      await request(app.getHttpServer()).get(path()).query({ page: -1 }).set('Authorization', owner.auth).expect(400);
    });

    it('no muestra reseñas borradas en Google', async () => {
      await seedReview({ deletedAt: new Date() });

      const response = await request(app.getHttpServer()).get(path()).set('Authorization', owner.auth).expect(200);

      expect(response.body.total).toBe(0);
    });
  });

  describe('detalle', () => {
    it('devuelve la reseña con las fechas de Google', async () => {
      await seedReview();

      const response = await request(app.getHttpServer())
        .get(path(`/${REVIEW_URN}`))
        .set('Authorization', owner.auth)
        .expect(200);

      expect(response.body).toMatchObject({ urn: REVIEW_URN, rating: 5, comment: 'Excelente atencion' });
      expect(response.body.createdAt).toBe('2026-09-01T10:00:00.000Z');
      // No se filtran identificadores internos de Google al cliente.
      expect(response.body).not.toHaveProperty('googleReviewId');
      expect(response.body).not.toHaveProperty('googleReviewName');
    });

    it('rechaza urns invalidos o de otra entidad', async () => {
      await request(app.getHttpServer()).get(path('/urn:business:1234')).set('Authorization', owner.auth).expect(404);
      await request(app.getHttpServer()).get(path('/basura')).set('Authorization', owner.auth).expect(404);
    });
  });

  describe('responder', () => {
    it('publica la respuesta en Google y actualiza la copia local', async () => {
      await seedReview();

      const response = await request(app.getHttpServer())
        .put(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .send({ comment: 'Gracias por tu visita!' })
        .expect(200);

      expect(response.body.reply).toMatchObject({ comment: 'Gracias por tu visita!' });
      expect(reviewsApi.replies.get(`google-${REVIEW_URN}`)).toMatchObject({ comment: 'Gracias por tu visita!' });
      // La ruta de la API v4 necesita cuenta + location.
      expect(reviewsApi.lastRef).toEqual({ accountName: 'accounts/111', locationId: '555' });

      const stored = await connection.collection('reviews').findOne({ urn: REVIEW_URN });
      expect(stored?.reply).toMatchObject({ comment: 'Gracias por tu visita!' });
    });

    it('editar una respuesta existente usa el mismo endpoint', async () => {
      await seedReview({ reply: { comment: 'Primera version', updateTime: new Date() } });

      const response = await request(app.getHttpServer())
        .put(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .send({ comment: 'Version corregida' })
        .expect(200);

      expect(response.body.reply.comment).toBe('Version corregida');
    });

    it('valida el contenido de la respuesta', async () => {
      await seedReview();

      const reply = (comment: unknown) =>
        request(app.getHttpServer())
          .put(path(`/${REVIEW_URN}/reply`))
          .set('Authorization', owner.auth)
          .send({ comment });

      await reply('').expect(400);
      // Una respuesta en blanco se publicaria en el perfil publico del negocio.
      await reply('   ').expect(400);
      await reply('\n\t  \n').expect(400);
      await reply('x'.repeat(MAX_REPLY_LENGTH + 1)).expect(400);
      await reply(12345).expect(400);
      await reply({ $ne: null }).expect(400);
      await reply('x'.repeat(MAX_REPLY_LENGTH)).expect(200);
    });

    it('recorta los espacios antes de publicar en Google', async () => {
      await seedReview();

      const response = await request(app.getHttpServer())
        .put(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .send({ comment: '   Gracias por tu visita!   ' })
        .expect(200);

      expect(response.body.reply.comment).toBe('Gracias por tu visita!');
      expect(reviewsApi.replies.get(`google-${REVIEW_URN}`)?.comment).toBe('Gracias por tu visita!');
    });

    it('traduce un 429 de Google en 503 y no toca la copia local', async () => {
      await seedReview();
      reviewsApi.error = new GoogleApiError(429, 'RESOURCE_EXHAUSTED', 'reviews.updateReply');

      const response = await request(app.getHttpServer())
        .put(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .send({ comment: 'Gracias!' })
        .expect(503);

      expect(response.body.errorCode).toBe('GOOGLE_RATE_LIMITED');
      const stored = await connection.collection('reviews').findOne({ urn: REVIEW_URN });
      expect(stored?.reply).toBeUndefined();
    });

    it('traduce los errores de Google sin filtrar el mensaje original', async () => {
      await seedReview();
      reviewsApi.error = new GoogleApiError(403, 'PERMISSION_DENIED', 'reviews.updateReply');

      const response = await request(app.getHttpServer())
        .put(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .send({ comment: 'Gracias!' })
        .expect(403);

      expect(response.body.errorCode).toBe('GOOGLE_PERMISSION_DENIED');
      expect(JSON.stringify(response.body)).not.toContain('reviews.updateReply');

      // Si Google rechazo, la copia local no puede quedar con una respuesta que no existe.
      const stored = await connection.collection('reviews').findOne({ urn: REVIEW_URN });
      expect(stored?.reply).toBeUndefined();
    });

    it('exige conexion de Google activa', async () => {
      await seedReview();
      await connection.collection('google_connections').deleteMany({});

      const response = await request(app.getHttpServer())
        .put(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .send({ comment: 'Gracias!' })
        .expect(404);

      expect(response.body.errorCode).toBe('GOOGLE_CONNECTION_NOT_FOUND');
    });
  });

  describe('borrar la respuesta', () => {
    it('la borra en Google y la quita de la copia local', async () => {
      await seedReview({ reply: { comment: 'Respuesta a borrar', updateTime: new Date() } });

      await request(app.getHttpServer())
        .delete(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .expect(204);

      expect(reviewsApi.deletedReplies).toEqual([`google-${REVIEW_URN}`]);
      const stored = await connection.collection('reviews').findOne({ urn: REVIEW_URN });
      expect(stored?.reply).toBeUndefined();
    });

    it('devuelve 404 si la reseña no tiene respuesta', async () => {
      await seedReview();

      const response = await request(app.getHttpServer())
        .delete(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .expect(404);

      expect(response.body.errorCode).toBe('REVIEW_REPLY_NOT_FOUND');
    });

    it('si en Google ya no existe, limpia la copia local igual', async () => {
      await seedReview({ reply: { comment: 'Respuesta vieja', updateTime: new Date() } });
      reviewsApi.deleteError = new GoogleApiError(404, 'NOT_FOUND', 'reviews.deleteReply');

      await request(app.getHttpServer())
        .delete(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', owner.auth)
        .expect(204);

      const stored = await connection.collection('reviews').findOne({ urn: REVIEW_URN });
      expect(stored?.reply).toBeUndefined();
    });
  });

  describe('aislamiento entre tenants', () => {
    it('un usuario ajeno no puede leer ni responder reseñas de otro negocio', async () => {
      await seedReview();
      const intruso = await registerUser(app);
      await createBusiness(app, intruso, { name: 'Negocio del Intruso' });

      await request(app.getHttpServer()).get(path()).set('Authorization', intruso.auth).expect(404);
      await request(app.getHttpServer())
        .get(path(`/${REVIEW_URN}`))
        .set('Authorization', intruso.auth)
        .expect(404);
      await request(app.getHttpServer())
        .put(path(`/${REVIEW_URN}/reply`))
        .set('Authorization', intruso.auth)
        .send({ comment: 'Respuesta de un impostor' })
        .expect(404);

      // Y nunca se llamo a Google con datos de este negocio.
      expect(reviewsApi.replies.size).toBe(0);
    });

    it('no se puede responder una reseña usando la location equivocada', async () => {
      await seedReview();

      // Segunda location del mismo business: la review no le pertenece.
      const otra = await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/google/locations/import`)
        .set('Authorization', owner.auth)
        .send({ accountName: 'accounts/111', locationNames: ['locations/666'] })
        .expect(201);

      await request(app.getHttpServer())
        .put(`/api/businesses/${businessUrn}/locations/${otra.body[0].urn}/reviews/${REVIEW_URN}/reply`)
        .set('Authorization', owner.auth)
        .send({ comment: 'Respuesta cruzada' })
        .expect(404);

      expect(reviewsApi.replies.size).toBe(0);
    });
  });
});
