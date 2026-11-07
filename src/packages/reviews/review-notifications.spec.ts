import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import {
  GOOGLE_ACCOUNTS_ADAPTER,
  GOOGLE_LOCATIONS_ADAPTER,
  GOOGLE_NOTIFICATIONS_ADAPTER,
  GOOGLE_OAUTH_ADAPTER,
  GOOGLE_PUSH_ADAPTER,
  GOOGLE_REVIEWS_ADAPTER,
  GoogleApiError,
  GoogleConfig,
} from '@shared/integrations/google/exports';
import { NotificationSettings } from '@packages/google/services';
import { createTestApp } from '../../../test/app.factory';
import {
  FAKE_PUSH_TOKEN,
  FakeGoogleAccountsAdapter,
  FakeGoogleLocationsAdapter,
  FakeGoogleNotificationsAdapter,
  FakeGoogleOAuthAdapter,
  FakeGooglePushAdapter,
  FakeGoogleReviewsAdapter,
  buildGoogleReview,
  buildPubSubPush,
} from '../../../test/google.fakes';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';
import { ReviewSyncQueue } from './services';

const TOPIC = 'projects/opinara/topics/gbp-reviews';
const OTHER_TOPIC = 'projects/otra-herramienta/topics/reviews';

describe('Avisos de Google en tiempo real (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let reviewsApi: FakeGoogleReviewsAdapter;
  let notificationsApi: FakeGoogleNotificationsAdapter;
  let oauth: FakeGoogleOAuthAdapter;
  let queue: ReviewSyncQueue;
  let owner: TestUser;
  let businessUrn: string;
  let locationUrn: string;
  const original = { ...GoogleConfig.Notifications };

  beforeAll(async () => {
    Object.assign(GoogleConfig.Notifications, { Enabled: true, Topic: TOPIC });
    reviewsApi = new FakeGoogleReviewsAdapter();
    notificationsApi = new FakeGoogleNotificationsAdapter();
    oauth = new FakeGoogleOAuthAdapter();

    ({ app, connection, close } = await createTestApp({ REVIEW_SYNC_ENABLED: 'false' }, [
      { token: GOOGLE_OAUTH_ADAPTER, value: oauth },
      { token: GOOGLE_ACCOUNTS_ADAPTER, value: new FakeGoogleAccountsAdapter() },
      { token: GOOGLE_LOCATIONS_ADAPTER, value: new FakeGoogleLocationsAdapter() },
      { token: GOOGLE_REVIEWS_ADAPTER, value: reviewsApi },
      { token: GOOGLE_NOTIFICATIONS_ADAPTER, value: notificationsApi },
      { token: GOOGLE_PUSH_ADAPTER, value: new FakeGooglePushAdapter() },
    ]));
    queue = app.get(ReviewSyncQueue);
  }, 120000);

  afterAll(async () => {
    Object.assign(GoogleConfig.Notifications, original);
    await close();
  });

  const connectAndImport = async (user: TestUser, urn: string): Promise<string> => {
    const { body } = await request(app.getHttpServer())
      .post(`/api/businesses/${urn}/google/connect`)
      .set('Authorization', user.auth)
      .expect(201);
    const state = new URL(body.authorizationUrl).searchParams.get('state') ?? '';
    await request(app.getHttpServer())
      .get('/api/auth/google/callback')
      .query({ code: 'codigo-valido', state })
      .expect(200);

    const imported = await request(app.getHttpServer())
      .post(`/api/businesses/${urn}/google/locations/import`)
      .set('Authorization', user.auth)
      .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
      .expect(201);

    return imported.body[0].urn;
  };

  const newBusiness = async () => {
    const user = await registerUser(app);
    const business = await createBusiness(app, user, { name: `Negocio ${Date.now()}${Math.random()}` });
    return { user, urn: business.urn as string };
  };

  beforeEach(async () => {
    Object.assign(reviewsApi, { error: undefined, listCalls: 0, reviews: [] });
    Object.assign(notificationsApi, { error: undefined, settings: new Map(), updates: [] });
    Object.assign(GoogleConfig.Notifications, { Enabled: true, Topic: TOPIC });

    const created = await newBusiness();
    owner = created.user;
    businessUrn = created.urn;
    locationUrn = await connectAndImport(owner, businessUrn);
  });

  afterEach(async () => {
    await queue.idle();
    await Promise.all(
      ['users', 'businesses', 'business_members', 'google_connections', 'oauth_states', 'locations', 'reviews'].map(
        (name) => connection.collection(name).deleteMany({}),
      ),
    );
  });

  /** `auth: null` manda el pedido sin header. */
  const notify = (body: unknown, auth: string | null = FAKE_PUSH_TOKEN) => {
    const call = request(app.getHttpServer()).post('/api/google/notifications');
    return (auth ? call.set('Authorization', auth) : call).send(body as object);
  };

  const notificationAccounts = async (urn = businessUrn) =>
    (await connection.collection('google_connections').findOne({ businessUrn: urn }))?.notificationAccounts;

  describe('registro de los avisos', () => {
    it('al importar sucursales, la cuenta de Google queda avisando a nuestro topic', async () => {
      expect(notificationsApi.updates).toEqual([
        { accountName: 'accounts/111', pubsubTopic: TOPIC, notificationTypes: ['NEW_REVIEW', 'UPDATED_REVIEW'] },
      ]);
      expect(await notificationAccounts()).toEqual([
        { accountName: 'accounts/111', status: 'ACTIVE', checkedAt: expect.any(Date) },
      ]);
    });

    it('no vuelve a escribir si la cuenta ya esta bien configurada', async () => {
      notificationsApi.updates = [];

      await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/google/locations/import`)
        .set('Authorization', owner.auth)
        .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
        .expect(201);

      expect(notificationsApi.updates).toEqual([]);
      expect(await notificationAccounts()).toHaveLength(1);
    });

    it('conserva los otros tipos de aviso que tenga nuestro topic', async () => {
      notificationsApi.settings.set('accounts/111', { pubsubTopic: TOPIC, notificationTypes: ['GOOGLE_UPDATE'] });

      await app.get(NotificationSettings).ensureForAccount(businessUrn, 'accounts/111');

      expect(notificationsApi.updates.at(-1)?.notificationTypes).toEqual([
        'GOOGLE_UPDATE',
        'NEW_REVIEW',
        'UPDATED_REVIEW',
      ]);
    });

    it('no pisa el topic de otra herramienta: queda en CONFLICT', async () => {
      notificationsApi.settings.set('accounts/111', { pubsubTopic: OTHER_TOPIC, notificationTypes: ['NEW_REVIEW'] });
      notificationsApi.updates = [];

      const status = await app.get(NotificationSettings).ensureForAccount(businessUrn, 'accounts/111');

      expect(status).toBe('CONFLICT');
      expect(notificationsApi.updates).toEqual([]);
      expect(notificationsApi.settings.get('accounts/111')?.pubsubTopic).toBe(OTHER_TOPIC);
      expect(await notificationAccounts()).toEqual([expect.objectContaining({ status: 'CONFLICT' })]);
    });

    it('si Google falla, la importacion igual sale bien y queda en ERROR', async () => {
      notificationsApi.error = new GoogleApiError(429, 'RESOURCE_EXHAUSTED', 'notifications.getNotificationSetting');

      await request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/google/locations/import`)
        .set('Authorization', owner.auth)
        .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
        .expect(201);

      expect(await notificationAccounts()).toEqual([expect.objectContaining({ status: 'ERROR' })]);
    });

    it('la reconciliacion diaria reintenta las cuentas que fallaron', async () => {
      notificationsApi.settings = new Map();
      notificationsApi.updates = [];

      const summary = await app.get(NotificationSettings).reconcileAll();

      expect(summary).toEqual({ accounts: 1, active: 1, conflict: 0, failed: 0 });
      expect(notificationsApi.settings.get('accounts/111')?.pubsubTopic).toBe(TOPIC);
    });

    it('con los avisos apagados no llama a Google', async () => {
      GoogleConfig.Notifications.Enabled = false;
      notificationsApi.updates = [];

      expect(await app.get(NotificationSettings).ensureForAccount(businessUrn, 'accounts/111')).toBeNull();
      expect(await app.get(NotificationSettings).reconcileAll()).toMatchObject({ accounts: 0 });
      expect(notificationsApi.updates).toEqual([]);
    });
  });

  describe('al desconectar', () => {
    const disconnect = (user = owner, urn = businessUrn) =>
      request(app.getHttpServer())
        .delete(`/api/businesses/${urn}/google/connection`)
        .set('Authorization', user.auth)
        .expect(204);

    it('la cuenta deja de avisarnos, antes de revocar el token', async () => {
      await disconnect();

      expect(notificationsApi.updates.at(-1)).toEqual({
        accountName: 'accounts/111',
        pubsubTopic: '',
        notificationTypes: [],
      });
      expect(notificationsApi.settings.get('accounts/111')?.pubsubTopic).toBeUndefined();
    });

    it('no borra el topic de otra herramienta', async () => {
      notificationsApi.settings.set('accounts/111', { pubsubTopic: OTHER_TOPIC, notificationTypes: ['NEW_REVIEW'] });

      await disconnect();

      expect(notificationsApi.settings.get('accounts/111')?.pubsubTopic).toBe(OTHER_TOPIC);
    });

    it('no corta los avisos de una cuenta que otro negocio sigue usando', async () => {
      const other = await newBusiness();
      await connectAndImport(other.user, other.urn);

      await disconnect();

      expect(notificationsApi.settings.get('accounts/111')?.pubsubTopic).toBe(TOPIC);
    });

    it('si Google falla, desconecta igual', async () => {
      notificationsApi.error = new GoogleApiError(503, 'UNAVAILABLE', 'notifications.getNotificationSetting');

      await disconnect();

      expect(await connection.collection('google_connections').countDocuments({ businessUrn })).toBe(0);
    });
  });

  describe('POST /api/google/notifications', () => {
    const reviewNotification = (locationName = 'accounts/111/locations/555') =>
      buildPubSubPush({
        type: 'NEW_REVIEW',
        locationName,
        reviewName: `${locationName}/reviews/nueva`,
      });

    it('sincroniza la sucursal del aviso y la reseña aparece', async () => {
      reviewsApi.reviews = [buildGoogleReview({ reviewId: 'nueva', comment: 'Recien llegada' })];

      await notify(reviewNotification()).expect(204);
      await queue.idle();

      const stored = await connection.collection('reviews').find({ businessUrn }).toArray();
      expect(stored).toEqual([expect.objectContaining({ locationUrn, comment: 'Recien llegada' })]);
      expect(reviewsApi.lastRef).toEqual({ accountName: 'accounts/111', locationId: '555' });
    });

    it('agrupa los avisos repetidos de la misma sucursal', async () => {
      // El primero arranca a sincronizar; los otros cuatro llegan durante la corrida y se juntan
      // en una sola sincronizacion mas, para no perder la reseña que entro mientras tanto.
      for (let index = 0; index < 5; index += 1) {
        queue.enqueue({ businessUrn, locationUrn });
      }
      await queue.idle();

      expect(reviewsApi.listCalls).toBe(2);
    });

    it('rechaza con 401 un pedido que no firmo Google, sin sincronizar', async () => {
      const response = await notify(reviewNotification(), 'Bearer inventado').expect(401);
      await notify(reviewNotification(), null).expect(401);
      await queue.idle();

      expect(response.body.errorCode).toBe('UNAUTHORIZED');
      expect(reviewsApi.listCalls).toBe(0);
    });

    it('confirma un aviso que no se entiende, para que Pub/Sub no lo reintente', async () => {
      await notify(buildPubSubPush({ type: 'NEW_REVIEW' })).expect(204);
      await notify({ cualquier: 'cosa' }).expect(204);
      await queue.idle();

      expect(reviewsApi.listCalls).toBe(0);
    });

    it('ignora sucursales que no tenemos o de otra cuenta', async () => {
      await notify(reviewNotification('accounts/111/locations/999')).expect(204);
      await notify(reviewNotification('accounts/222/locations/555')).expect(204);
      await queue.idle();

      expect(reviewsApi.listCalls).toBe(0);
    });

    it('no sincroniza una sucursal desactivada', async () => {
      await connection.collection('locations').updateOne({ urn: locationUrn }, { $set: { isActive: false } });

      await notify(reviewNotification()).expect(204);
      await queue.idle();

      expect(reviewsApi.listCalls).toBe(0);
    });

    it('un error de Google al sincronizar no cambia la respuesta: lo levanta el cron', async () => {
      reviewsApi.error = new GoogleApiError(503, 'UNAVAILABLE', 'reviews.list');

      await notify(reviewNotification()).expect(204);
      await queue.idle();

      expect(await connection.collection('reviews').countDocuments({ businessUrn })).toBe(0);
    });

    it('con los avisos apagados el endpoint no existe', async () => {
      GoogleConfig.Notifications.Enabled = false;

      await notify(reviewNotification()).expect(404);
    });
  });
});
