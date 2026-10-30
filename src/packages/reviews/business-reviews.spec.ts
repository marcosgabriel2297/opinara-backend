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
import { REPLY_SUGGESTER, ReplySuggester, ReplySuggestionInput } from './services';

/** Doble de la sugerencia: nunca llama a un modelo. */
class FakeReplySuggester implements ReplySuggester {
  available = true;
  result: string | null = 'Gracias, Ana. ¡Te esperamos pronto!';
  error: Error | undefined;
  calls: ReplySuggestionInput[] = [];

  async suggest(input: ReplySuggestionInput): Promise<string | null> {
    this.calls.push(input);
    if (this.error) throw this.error;
    return this.result;
  }
}

const day = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * day);

describe('Reseñas del negocio, resumen y sugerencias (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let suggester: FakeReplySuggester;
  let owner: TestUser;
  let businessUrn: string;
  let centroUrn: string;
  let palermoUrn: string;
  let counter = 0;

  beforeAll(async () => {
    suggester = new FakeReplySuggester();
    ({ app, connection, close } = await createTestApp({}, [
      { token: GOOGLE_OAUTH_ADAPTER, value: new FakeGoogleOAuthAdapter() },
      { token: GOOGLE_ACCOUNTS_ADAPTER, value: new FakeGoogleAccountsAdapter() },
      { token: GOOGLE_LOCATIONS_ADAPTER, value: new FakeGoogleLocationsAdapter() },
      { token: GOOGLE_REVIEWS_ADAPTER, value: new FakeGoogleReviewsAdapter() },
      { token: REPLY_SUGGESTER, value: suggester },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    Object.assign(suggester, { available: true, result: 'Gracias, Ana. ¡Te esperamos pronto!', error: undefined });
    suggester.calls = [];

    owner = await registerUser(app);
    const business = await createBusiness(app, owner, { name: 'Cafe de la Esquina' });
    businessUrn = business.urn;

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
      .send({ accountName: 'accounts/111', locationNames: ['locations/555', 'locations/666'] })
      .expect(201);
    [centroUrn, palermoUrn] = imported.body.map((location: { urn: string }) => location.urn);
  });

  afterEach(async () => {
    await Promise.all(
      ['users', 'businesses', 'business_members', 'google_connections', 'oauth_states', 'locations', 'reviews'].map(
        (name) => connection.collection(name).deleteMany({}),
      ),
    );
  });

  const seedReview = async (fields: Record<string, unknown> = {}) => {
    counter += 1;
    const urn = `urn:review:bbbbbbbb-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    const createdAt = (fields.googleCreateTime as Date | undefined) ?? daysAgo(1);
    await connection.collection('reviews').insertOne({
      urn,
      businessUrn,
      locationUrn: centroUrn,
      googleReviewId: `google-${urn}`,
      googleReviewName: `accounts/111/locations/555/reviews/google-${urn}`,
      starRating: 5,
      starRatingRaw: 'FIVE',
      comment: 'Excelente atencion',
      reviewer: { displayName: 'Ana Perez', isAnonymous: false },
      googleCreateTime: createdAt,
      googleUpdateTime: createdAt,
      syncedAt: new Date(),
      ...fields,
    });
    return urn;
  };

  const get = (path: string, query: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .get(`/api/businesses/${businessUrn}${path}`)
      .query(query)
      .set('Authorization', owner.auth);

  describe('listado de todo el negocio', () => {
    it('junta las sucursales y ordena por la que más espera con `oldest`', async () => {
      await seedReview({ comment: 'Centro reciente', googleCreateTime: daysAgo(1) });
      await seedReview({ comment: 'Palermo vieja', locationUrn: palermoUrn, googleCreateTime: daysAgo(9) });
      await seedReview({ comment: 'Respondida', googleCreateTime: daysAgo(20), reply: { comment: 'Gracias' } });

      const response = await get('/reviews', { hasReply: false, order: 'oldest' }).expect(200);

      expect(response.body.total).toBe(2);
      expect(response.body.items.map((review: { comment: string }) => review.comment)).toEqual([
        'Palermo vieja',
        'Centro reciente',
      ]);
      expect(response.body.items[0].locationUrn).toBe(palermoUrn);
    });

    it('filtra por sucursal y rechaza una que no es del negocio', async () => {
      await seedReview({ comment: 'Centro' });
      await seedReview({ comment: 'Palermo', locationUrn: palermoUrn });

      const soloPalermo = await get('/reviews', { locationUrn: palermoUrn }).expect(200);
      expect(soloPalermo.body.items.map((review: { comment: string }) => review.comment)).toEqual(['Palermo']);

      await get('/reviews', { locationUrn: 'urn:location:00000000-0000-4000-8000-000000000000' }).expect(404);
      await get('/reviews', { order: 'random' }).expect(400);
    });

    it('no muestra reseñas borradas en Google ni de otro negocio', async () => {
      await seedReview({ deletedAt: new Date() });
      await seedReview({ businessUrn: 'urn:business:00000000-0000-4000-8000-000000000000' });

      const response = await get('/reviews').expect(200);
      expect(response.body.total).toBe(0);
    });
  });

  describe('resumen', () => {
    it('cuenta, promedia sin las que no tienen calificación y compara las dos ventanas de 30 días', async () => {
      await seedReview({ starRating: 5, googleCreateTime: daysAgo(2) });
      await seedReview({ starRating: 3, googleCreateTime: daysAgo(10), reply: { comment: 'Gracias' } });
      await seedReview({ starRating: 0, starRatingRaw: 'STAR_RATING_UNSPECIFIED', googleCreateTime: daysAgo(5) });
      await seedReview({ starRating: 2, googleCreateTime: daysAgo(45), locationUrn: palermoUrn });
      await seedReview({ starRating: 1, googleCreateTime: daysAgo(400), deletedAt: new Date() });

      const response = await get('/reviews/summary').expect(200);

      expect(response.body).toMatchObject({
        total: 4,
        unanswered: 3,
        averageRating: 3.33,
        ratingCounts: { '1': 0, '2': 1, '3': 1, '4': 0, '5': 1 },
        last30Days: { count: 3, averageRating: 4 },
        previous30Days: { count: 1, averageRating: 2 },
        replySuggestions: true,
      });
      expect(new Date(response.body.oldestUnansweredAt).getTime()).toBeLessThan(daysAgo(44).getTime());
    });

    it('sin reseñas no inventa promedios', async () => {
      suggester.available = false;
      const response = await get('/reviews/summary').expect(200);

      expect(response.body).toMatchObject({
        total: 0,
        unanswered: 0,
        oldestUnansweredAt: null,
        averageRating: null,
        last30Days: { count: 0, averageRating: null },
        replySuggestions: false,
      });
    });
  });

  describe('respuesta sugerida', () => {
    const suggest = (reviewUrn: string, locationUrn = centroUrn) =>
      request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/locations/${locationUrn}/reviews/${reviewUrn}/reply-suggestion`)
        .set('Authorization', owner.auth);

    it('devuelve un borrador sin publicar nada, con el nombre de pila y el contexto del negocio', async () => {
      const urn = await seedReview({ starRating: 4, comment: 'Muy rico todo' });

      const response = await suggest(urn).expect(200);

      expect(response.body).toEqual({ comment: 'Gracias, Ana. ¡Te esperamos pronto!' });
      expect(suggester.calls).toEqual([
        {
          businessName: 'Cafe de la Esquina',
          locationTitle: expect.any(String),
          rating: 4,
          reviewerFirstName: 'Ana',
          comment: 'Muy rico todo',
        },
      ]);
      const stored = await connection.collection('reviews').findOne({ urn });
      expect(stored?.reply).toBeUndefined();
    });

    it('a una reseña anónima no le pone nombre', async () => {
      const urn = await seedReview({ reviewer: { isAnonymous: true } });
      await suggest(urn).expect(200);
      expect(suggester.calls[0]?.reviewerFirstName).toBeUndefined();
    });

    it('sin credenciales responde 503 con su código y no llama al modelo', async () => {
      suggester.available = false;
      const urn = await seedReview();

      const response = await suggest(urn).expect(503);
      expect(response.body.errorCode).toBe('REPLY_SUGGESTIONS_UNAVAILABLE');
      expect(suggester.calls).toHaveLength(0);
    });

    it('si el modelo falla o no devuelve texto, avisa con un código propio', async () => {
      const urn = await seedReview();

      suggester.error = new Error('timeout');
      expect((await suggest(urn).expect(503)).body.errorCode).toBe('REPLY_SUGGESTION_FAILED');

      suggester.error = undefined;
      suggester.result = null;
      expect((await suggest(urn).expect(503)).body.errorCode).toBe('REPLY_SUGGESTION_FAILED');
    });

    it('la reseña tiene que ser de esa sucursal', async () => {
      const urn = await seedReview();
      await suggest(urn, palermoUrn).expect(404);
      expect(suggester.calls).toHaveLength(0);
    });
  });
});
