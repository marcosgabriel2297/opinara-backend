import { createHash } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import {
  GOOGLE_ACCOUNTS_ADAPTER,
  GOOGLE_LOCATIONS_ADAPTER,
  GOOGLE_OAUTH_ADAPTER,
  GoogleApiError,
} from '@shared/integrations/google/exports';
import { createTestApp } from '../../../test/app.factory';
import {
  FAKE_ACCESS_TOKEN,
  FAKE_REFRESH_TOKEN,
  FakeGoogleAccountsAdapter,
  FakeGoogleLocationsAdapter,
  FakeGoogleOAuthAdapter,
} from '../../../test/google.fakes';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';

const hash = (state: string): string => createHash('sha256').update(state, 'utf8').digest('base64');

const stateFromUrl = (url: string): string => new URL(url).searchParams.get('state') ?? '';

describe('Google (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let oauth: FakeGoogleOAuthAdapter;
  let accounts: FakeGoogleAccountsAdapter;
  let locations: FakeGoogleLocationsAdapter;
  let owner: TestUser;
  let business: { urn: string; slug: string };

  beforeAll(async () => {
    oauth = new FakeGoogleOAuthAdapter();
    accounts = new FakeGoogleAccountsAdapter();
    locations = new FakeGoogleLocationsAdapter();

    ({ app, connection, close } = await createTestApp({}, [
      { token: GOOGLE_OAUTH_ADAPTER, value: oauth },
      { token: GOOGLE_ACCOUNTS_ADAPTER, value: accounts },
      { token: GOOGLE_LOCATIONS_ADAPTER, value: locations },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    Object.assign(oauth, {
      configured: true,
      refreshCalls: 0,
      revokedTokens: [],
      refreshError: undefined,
      exchangeError: undefined,
      omitRefreshToken: false,
    });
    accounts.error = undefined;
    locations.error = undefined;

    owner = await registerUser(app);
    business = await createBusiness(app, owner, { name: `Negocio ${Date.now()}${Math.random()}` });
  });

  afterEach(async () => {
    await Promise.all(
      ['users', 'businesses', 'business_members', 'google_connections', 'oauth_states', 'locations'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
  });

  const connect = (user: TestUser = owner, businessUrn: string = business.urn) =>
    request(app.getHttpServer()).post(`/api/businesses/${businessUrn}/google/connect`).set('Authorization', user.auth);

  const callback = (query: Record<string, string>) =>
    request(app.getHttpServer()).get('/api/auth/google/callback').query(query);

  /** Deja el business con una conexion activa y devuelve el state usado. */
  const establishConnection = async (user: TestUser = owner, businessUrn: string = business.urn) => {
    const { body } = await connect(user, businessUrn).expect(201);
    const state = stateFromUrl(body.authorizationUrl);
    await callback({ code: 'codigo-valido', state }).expect(200);
    return state;
  };

  describe('inicio del flujo OAuth', () => {
    it('devuelve la URL de consentimiento con los parametros que Google necesita', async () => {
      const { body } = await connect().expect(201);

      const url = new URL(body.authorizationUrl);
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      // Sin offline+consent Google no manda refresh token y habria que reconectar a diario.
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/business.manage');
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('guarda el state hasheado, nunca en claro', async () => {
      const { body } = await connect().expect(201);
      const state = stateFromUrl(body.authorizationUrl);

      const stored = await connection.collection('oauth_states').findOne({ businessUrn: business.urn });

      expect(stored?.stateHash).toBe(hash(state));
      expect(JSON.stringify(stored)).not.toContain(state);
    });

    it('solo el OWNER puede iniciar la conexion', async () => {
      const invitado = await registerUser(app);
      await connection.collection('business_members').insertOne({
        urn: 'urn:business-member:invitado-google',
        businessUrn: business.urn,
        userUrn: invitado.urn,
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      const response = await connect(invitado).expect(403);
      expect(response.body.errorCode).toBe('BUSINESS_FORBIDDEN');
    });

    it('un usuario ajeno recibe 404 y no puede iniciar el flujo', async () => {
      const ajeno = await registerUser(app);

      await connect(ajeno).expect(404);
      expect(await connection.collection('oauth_states').countDocuments()).toBe(0);
    });

    it('responde 503 si el servidor no tiene credenciales de Google configuradas', async () => {
      oauth.configured = false;

      const response = await connect().expect(503);
      expect(response.body.errorCode).toBe('GOOGLE_NOT_CONFIGURED');
    });
  });

  describe('callback', () => {
    it('crea la conexion y guarda los tokens cifrados', async () => {
      const { body } = await connect().expect(201);
      const state = stateFromUrl(body.authorizationUrl);

      const response = await callback({ code: 'codigo-valido', state }).expect(200);
      expect(response.body).toEqual({ status: 'connected' });

      const stored = await connection.collection('google_connections').findOne({ businessUrn: business.urn });
      expect(stored).toMatchObject({ status: 'ACTIVE', connectedByUserUrn: owner.urn });

      // Ni el refresh ni el access token pueden aparecer en claro en la base.
      const raw = JSON.stringify(stored);
      expect(raw).not.toContain(FAKE_REFRESH_TOKEN);
      expect(raw).not.toContain(FAKE_ACCESS_TOKEN);
      expect(stored?.refreshToken).toMatchObject({
        ciphertext: expect.any(String),
        iv: expect.any(String),
        tag: expect.any(String),
        keyVersion: 1,
      });
    });

    it('consume el state una sola vez: el replay falla', async () => {
      const { body } = await connect().expect(201);
      const state = stateFromUrl(body.authorizationUrl);

      await callback({ code: 'codigo-valido', state }).expect(200);
      const replay = await callback({ code: 'codigo-valido', state }).expect(400);

      expect(replay.body.errorCode).toBe('GOOGLE_INVALID_OAUTH_STATE');
      expect(await connection.collection('oauth_states').countDocuments()).toBe(0);
    });

    it('rechaza un state inexistente, vencido o ausente', async () => {
      await callback({ code: 'codigo-valido', state: 'state-inventado' }).expect(400);
      await callback({ code: 'codigo-valido' }).expect(400);
      await callback({ state: 'algo' }).expect(400);

      const { body } = await connect().expect(201);
      const state = stateFromUrl(body.authorizationUrl);
      await connection
        .collection('oauth_states')
        .updateOne({ stateHash: hash(state) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      const expired = await callback({ code: 'codigo-valido', state }).expect(400);
      expect(expired.body.errorCode).toBe('GOOGLE_INVALID_OAUTH_STATE');
      expect(await connection.collection('google_connections').countDocuments()).toBe(0);
    });

    it('el state determina el business: no se puede conectar el negocio de otro', async () => {
      const otro = await registerUser(app);
      const otroBusiness = await createBusiness(app, otro, { name: 'Negocio del Otro' });

      const { body } = await connect().expect(201);
      await callback({ code: 'codigo-valido', state: stateFromUrl(body.authorizationUrl) }).expect(200);

      expect(await connection.collection('google_connections').countDocuments({ businessUrn: business.urn })).toBe(1);
      expect(await connection.collection('google_connections').countDocuments({ businessUrn: otroBusiness.urn })).toBe(
        0,
      );
    });

    it('rechaza la conexion si Google no devuelve refresh token', async () => {
      oauth.omitRefreshToken = true;
      const { body } = await connect().expect(201);

      const response = await callback({ code: 'codigo-valido', state: stateFromUrl(body.authorizationUrl) }).expect(
        400,
      );

      expect(response.body.errorCode).toBe('GOOGLE_MISSING_REFRESH_TOKEN');
      expect(await connection.collection('google_connections').countDocuments()).toBe(0);
    });

    it('traduce un code invalido y no filtra el error crudo de Google', async () => {
      const { body } = await connect().expect(201);

      const response = await callback({
        code: 'codigo-invalido',
        state: stateFromUrl(body.authorizationUrl),
      }).expect(400);

      expect(response.body.errorCode).toBe('GOOGLE_INVALID_OAUTH_STATE');
      expect(JSON.stringify(response.body)).not.toContain('invalid_grant');
    });

    it('no confunde un fallo del intercambio con una conexion revocada', async () => {
      // Caso real: credenciales de OAuth mal configuradas -> Google responde 401 invalid_client.
      oauth.exchangeError = new GoogleApiError(401, 'invalid_client', 'oauth.exchangeCode');
      const { body } = await connect().expect(201);

      const response = await callback({
        code: 'codigo-valido',
        state: stateFromUrl(body.authorizationUrl),
      }).expect(400);

      expect(response.body.errorCode).toBe('GOOGLE_OAUTH_EXCHANGE_FAILED');
      expect(JSON.stringify(response.body)).not.toContain('invalid_client');
    });

    it('propaga como 503 una caida de Google durante el intercambio', async () => {
      oauth.exchangeError = new GoogleApiError(503, 'UNAVAILABLE', 'oauth.exchangeCode');
      const { body } = await connect().expect(201);

      const response = await callback({
        code: 'codigo-valido',
        state: stateFromUrl(body.authorizationUrl),
      }).expect(503);

      expect(response.body.errorCode).toBe('GOOGLE_UNAVAILABLE');
    });

    it('informa cuando el usuario cancela el consentimiento', async () => {
      const response = await callback({ error: 'access_denied' }).expect(200);

      expect(response.body).toMatchObject({ status: 'error', errorCode: 'GOOGLE_PERMISSION_DENIED' });
    });
  });

  describe('estado y desconexion', () => {
    it('expone el estado de la conexion sin ningun token', async () => {
      await establishConnection();

      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/connection`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(response.body).toMatchObject({ status: 'ACTIVE', scopes: expect.any(Array) });
      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain(FAKE_REFRESH_TOKEN);
      expect(raw).not.toContain('ciphertext');
    });

    it('devuelve 404 cuando el business no tiene conexion', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/connection`)
        .set('Authorization', owner.auth)
        .expect(404);

      expect(response.body.errorCode).toBe('GOOGLE_CONNECTION_NOT_FOUND');
    });

    it('al desconectar revoca en Google y borra los tokens locales', async () => {
      await establishConnection();

      await request(app.getHttpServer())
        .delete(`/api/businesses/${business.urn}/google/connection`)
        .set('Authorization', owner.auth)
        .expect(204);

      expect(oauth.revokedTokens).toEqual([FAKE_REFRESH_TOKEN]);
      expect(await connection.collection('google_connections').countDocuments()).toBe(0);
      expect(await connection.collection('oauth_states').countDocuments({ businessUrn: business.urn })).toBe(0);
    });
  });

  describe('renovacion de tokens', () => {
    it('reutiliza el access token vigente sin llamar a Google', async () => {
      await establishConnection();

      await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/accounts`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(oauth.refreshCalls).toBe(0);
      expect(accounts.lastAccessToken).toBe(FAKE_ACCESS_TOKEN);
    });

    it('renueva y persiste el access token cuando esta por vencer', async () => {
      await establishConnection();
      await connection
        .collection('google_connections')
        .updateOne({ businessUrn: business.urn }, { $set: { accessTokenExpiresAt: new Date(Date.now() + 1000) } });

      await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/accounts`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(oauth.refreshCalls).toBe(1);
      expect(accounts.lastAccessToken).toBe(`${FAKE_ACCESS_TOKEN}-renovado-1`);

      // La segunda llamada ya usa el token renovado que quedo guardado.
      await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/accounts`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(oauth.refreshCalls).toBe(1);
    });

    it('marca la conexion como REVOKED cuando Google responde invalid_grant', async () => {
      await establishConnection();
      await connection
        .collection('google_connections')
        .updateOne({ businessUrn: business.urn }, { $set: { accessTokenExpiresAt: new Date(Date.now() - 1000) } });
      oauth.refreshError = new GoogleApiError(400, 'invalid_grant', 'oauth.refreshAccessToken');

      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/accounts`)
        .set('Authorization', owner.auth)
        .expect(400);

      expect(response.body.errorCode).toBe('GOOGLE_CONNECTION_REVOKED');
      const stored = await connection.collection('google_connections').findOne({ businessUrn: business.urn });
      expect(stored).toMatchObject({ status: 'REVOKED' });

      // Ya marcada, ni siquiera se vuelve a intentar contra Google.
      oauth.refreshCalls = 0;
      await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/accounts`)
        .set('Authorization', owner.auth)
        .expect(400);
      expect(oauth.refreshCalls).toBe(0);
    });
  });

  describe('accounts y locations', () => {
    it('exige conexion para listar accounts', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/accounts`)
        .set('Authorization', owner.auth)
        .expect(404);

      expect(response.body.errorCode).toBe('GOOGLE_CONNECTION_NOT_FOUND');
    });

    it('lista las locations disponibles marcando las ya importadas', async () => {
      await establishConnection();

      const antes = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/locations`)
        .query({ accountName: 'accounts/111' })
        .set('Authorization', owner.auth)
        .expect(200);
      expect(antes.body).toHaveLength(2);
      expect(antes.body.every((location: { imported: boolean }) => !location.imported)).toBe(true);

      await request(app.getHttpServer())
        .post(`/api/businesses/${business.urn}/google/locations/import`)
        .set('Authorization', owner.auth)
        .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
        .expect(201);

      const despues = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/locations`)
        .query({ accountName: 'accounts/111' })
        .set('Authorization', owner.auth)
        .expect(200);
      expect(despues.body.find((l: { name: string }) => l.name === 'locations/555').imported).toBe(true);
      expect(despues.body.find((l: { name: string }) => l.name === 'locations/666').imported).toBe(false);
    });

    it('valida el formato de los identificadores de Google', async () => {
      await establishConnection();

      await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/locations`)
        .query({ accountName: '../../etc/passwd' })
        .set('Authorization', owner.auth)
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/businesses/${business.urn}/google/locations/import`)
        .set('Authorization', owner.auth)
        .send({ accountName: 'accounts/111', locationNames: ['locations/555/../../accounts'] })
        .expect(400);
    });

    it('traduce un 429 de Google a 503 sin filtrar el error original', async () => {
      await establishConnection();
      accounts.error = new GoogleApiError(429, 'RESOURCE_EXHAUSTED', 'accounts.list');

      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/google/accounts`)
        .set('Authorization', owner.auth)
        .expect(503);

      expect(response.body.errorCode).toBe('GOOGLE_RATE_LIMITED');
      expect(JSON.stringify(response.body)).not.toContain('RESOURCE_EXHAUSTED');
    });
  });

  describe('importacion de locations', () => {
    beforeEach(async () => {
      await establishConnection();
    });

    const importLocations = (names: string[]) =>
      request(app.getHttpServer())
        .post(`/api/businesses/${business.urn}/google/locations/import`)
        .set('Authorization', owner.auth)
        .send({ accountName: 'accounts/111', locationNames: names });

    it('importa las locations elegidas con sus datos de Google', async () => {
      const response = await importLocations(['locations/555']).expect(201);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        title: 'Sucursal Centro',
        storeCode: 'CENTRO',
        placeId: 'ChIJfake555',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJfake555',
        hasVoiceOfMerchant: true,
      });
      expect(response.body[0].urn).toMatch(/^urn:location:/);
    });

    it('es idempotente: reimportar actualiza y no duplica', async () => {
      const primera = await importLocations(['locations/555']).expect(201);

      locations.locations[0].title = 'Sucursal Centro Renombrada';
      const segunda = await importLocations(['locations/555']).expect(201);

      expect(segunda.body[0].urn).toBe(primera.body[0].urn);
      expect(segunda.body[0].title).toBe('Sucursal Centro Renombrada');
      expect(await connection.collection('locations').countDocuments({ businessUrn: business.urn })).toBe(1);

      locations.locations[0].title = 'Sucursal Centro';
    });

    it('rechaza una location que la cuenta conectada no administra', async () => {
      const response = await importLocations(['locations/999']).expect(404);

      expect(response.body.errorCode).toBe('GOOGLE_RESOURCE_NOT_FOUND');
      expect(await connection.collection('locations').countDocuments()).toBe(0);
    });

    it('las locations importadas quedan aisladas por business', async () => {
      await importLocations(['locations/555', 'locations/666']).expect(201);

      const propias = await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/locations`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(propias.body).toHaveLength(2);

      const ajeno = await registerUser(app);
      const otroBusiness = await createBusiness(app, ajeno, { name: 'Negocio Vecino' });

      // El vecino no ve nada, y tampoco puede leer una location ajena por su urn.
      const vacias = await request(app.getHttpServer())
        .get(`/api/businesses/${otroBusiness.urn}/locations`)
        .set('Authorization', ajeno.auth)
        .expect(200);
      expect(vacias.body).toHaveLength(0);

      await request(app.getHttpServer())
        .get(`/api/businesses/${otroBusiness.urn}/locations/${propias.body[0].urn}`)
        .set('Authorization', ajeno.auth)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/businesses/${business.urn}/locations/${propias.body[0].urn}`)
        .set('Authorization', ajeno.auth)
        .expect(404);
    });
  });
});
