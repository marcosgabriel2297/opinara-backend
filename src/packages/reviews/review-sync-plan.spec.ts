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
  buildGoogleReview,
} from '../../../test/google.fakes';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';
import { ReviewSyncService } from './services/review-sync.service';

const day = (n: number): Date => new Date(`2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`);

describe('Sincronizacion de reviews segun el plan (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let reviewsApi: FakeGoogleReviewsAdapter;
  let owner: TestUser;
  let businessUrn: string;

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

    await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/locations/import`)
      .set('Authorization', owner.auth)
      .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
      .expect(201);
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

  const setPlan = (plan: string) =>
    connection.collection('businesses').updateOne({ urn: businessUrn }, { $set: { plan } });

  it('un negocio de solo fidelizacion no puede sincronizar reseñas', async () => {
    await setPlan('LOYALTY');

    const response = await sync().expect(403);

    expect(response.body.errorCode).toBe('PLAN_FEATURE_NOT_INCLUDED');
    expect(reviewsApi.listCalls).toBe(0);
  });

  it('el cron deja afuera a los negocios sin reseñas en el plan, sin pedirle nada a Google', async () => {
    reviewsApi.reviews = [buildGoogleReview({ reviewId: 'r1', updateTime: day(1), createTime: day(1) })];
    const service = app.get(ReviewSyncService);

    await setPlan('LOYALTY');
    expect(await service.syncAllLocations()).toMatchObject({ locations: 0, failed: 0 });
    expect(reviewsApi.listCalls).toBe(0);

    await setPlan('REVIEWS_LOYALTY');
    expect(await service.syncAllLocations()).toMatchObject({ locations: 1, imported: 1 });
  });
});
