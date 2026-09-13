import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';

const CREDENTIALS = { email: 'Dueno@Negocio.test', password: 'unaClaveSegura1', name: 'Dueño del negocio' };

describe('Authentication (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp());
  }, 120000);

  afterAll(async () => {
    await close();
  });

  afterEach(async () => {
    await connection.collection('users').deleteMany({});
  });

  const register = (payload: Record<string, unknown> = CREDENTIALS) =>
    request(app.getHttpServer()).post('/api/auth/register').send(payload);

  const login = (payload: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/auth/login').send(payload);

  describe('register', () => {
    it('crea el usuario y devuelve la sesion sin exponer el password', async () => {
      const response = await register().expect(201);

      expect(response.body.user).toMatchObject({ email: 'dueno@negocio.test', name: 'Dueño del negocio' });
      expect(response.body.user.urn).toMatch(/^urn:user:/);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.expiresIn).toBe(86400);
      expect(JSON.stringify(response.body)).not.toContain(CREDENTIALS.password);
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('_id');
    });

    it('guarda el password hasheado, nunca en texto plano', async () => {
      await register().expect(201);

      const stored = await connection.collection('users').findOne({ email: 'dueno@negocio.test' });

      expect(stored?.password).toEqual(expect.stringMatching(/^\$2[aby]\$12\$/));
      expect(stored?.password).not.toBe(CREDENTIALS.password);
    });

    it('rechaza un email ya registrado', async () => {
      await register().expect(201);

      const response = await register({ ...CREDENTIALS, name: 'Otro' }).expect(409);

      expect(response.body.errorCode).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rechaza passwords cortos y emails invalidos', async () => {
      await register({ ...CREDENTIALS, password: 'corta' }).expect(400);
      await register({ ...CREDENTIALS, email: 'no-es-un-email' }).expect(400);
    });

    it('devuelve 409, no 500, ante registros concurrentes con el mismo email', async () => {
      const responses = await Promise.all([register(), register(), register(), register(), register()]);

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      // Ningun mensaje puede filtrar nombres de coleccion o de indice de Mongo.
      expect(JSON.stringify(responses.map((response) => response.body))).not.toContain('E11000');
      expect(await connection.collection('users').countDocuments({ email: 'dueno@negocio.test' })).toBe(1);
    });

    it('no trunca passwords largos (bcrypt corta a 72 bytes)', async () => {
      const password = `${'A'.repeat(72)}-sufijo-unico`;
      await register({ ...CREDENTIALS, password }).expect(201);

      await login({ email: CREDENTIALS.email, password }).expect(200);
      await login({ email: CREDENTIALS.email, password: 'A'.repeat(72) }).expect(401);
      await login({ email: CREDENTIALS.email, password: `${'A'.repeat(72)}-otro-sufijo` }).expect(401);
    });

    it('rechaza campos no declarados en el DTO', async () => {
      const response = await register({ ...CREDENTIALS, status: 'ADMIN' }).expect(400);

      expect(response.body.message).toContain('status');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('autentica con el email en cualquier capitalizacion', async () => {
      const response = await login({ email: 'DUENO@negocio.test', password: CREDENTIALS.password }).expect(200);

      expect(response.body.user.email).toBe('dueno@negocio.test');
      expect(response.body).toHaveProperty('accessToken');
    });

    it('devuelve el mismo error para password incorrecto y email inexistente', async () => {
      const wrongPassword = await login({ email: CREDENTIALS.email, password: 'otraClaveSegura1' }).expect(401);
      const unknownEmail = await login({ email: 'nadie@negocio.test', password: CREDENTIALS.password }).expect(401);

      expect(wrongPassword.body.errorCode).toBe('WRONG_CREDENTIALS');
      expect(unknownEmail.body.errorCode).toBe('WRONG_CREDENTIALS');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('bloquea a un usuario inactivo', async () => {
      await connection.collection('users').updateOne({ email: 'dueno@negocio.test' }, { $set: { status: 'INACTIVE' } });

      const response = await login({ email: CREDENTIALS.email, password: CREDENTIALS.password }).expect(403);

      expect(response.body.errorCode).toBe('USER_INACTIVE');
    });
  });

  describe('me', () => {
    it('rechaza pedidos sin token, con token invalido o con esquema equivocado', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer no-es-un-jwt').expect(401);

      const { body } = await register().expect(201);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Basic ${body.accessToken}`)
        .expect(401);
    });

    it('devuelve el usuario autenticado', async () => {
      const { body } = await register().expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ urn: body.user.urn, email: 'dueno@negocio.test', status: 'ACTIVE' });
      expect(response.body).not.toHaveProperty('password');
    });

    it('no acepta un refresh token como access token', async () => {
      const { body } = await register().expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${body.refreshToken}`)
        .expect(401);

      expect(response.body.errorCode).toBe('UNAUTHORIZED');
    });
  });

  describe('refresh', () => {
    it('entrega una sesion nueva a partir del refresh token', async () => {
      const { body } = await register().expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(200);

      expect(response.body.user.urn).toBe(body.user.urn);
      expect(response.body).toHaveProperty('accessToken');

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    });

    it('rechaza un access token, un token corrupto y un usuario borrado', async () => {
      const { body } = await register().expect(201);

      const withAccess = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: body.accessToken })
        .expect(401);
      expect(withAccess.body.errorCode).toBe('INVALID_REFRESH_TOKEN');

      await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: 'basura' }).expect(401);

      await connection.collection('users').deleteMany({});
      const deletedUser = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(401);
      expect(deletedUser.body.errorCode).toBe('INVALID_REFRESH_TOKEN');
    });
  });
});
