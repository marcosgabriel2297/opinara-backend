import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { createAdmin } from '../../../test/helpers';

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

  let adminAuth: string;

  beforeEach(async () => {
    adminAuth = await createAdmin(app);
  });

  afterEach(async () => {
    await Promise.all(['users', 'admins', 'sessions'].map((name) => connection.collection(name).deleteMany({})));
  });

  const http = () => request(app.getHttpServer());

  /** Alta por el admin + primer inicio de sesion con la contraseña provisoria. */
  const firstLogin = async () => {
    const created = await http()
      .post('/api/admin/users')
      .set('Authorization', adminAuth)
      .send({ email: CREDENTIALS.email, name: CREDENTIALS.name })
      .expect(201);
    const session = await login({ email: CREDENTIALS.email, password: created.body.temporaryPassword }).expect(200);
    return { temporaryPassword: created.body.temporaryPassword as string, session: session.body };
  };

  const changePassword = (accessToken: string, payload: Record<string, unknown>) =>
    http().post('/api/auth/password/change').set('Authorization', `Bearer ${accessToken}`).send(payload);

  /** Usuario con su propia contraseña ya elegida: devuelve la sesion de un login normal. */
  const register = async (password = CREDENTIALS.password) => {
    const { temporaryPassword, session } = await firstLogin();
    await changePassword(session.accessToken, { currentPassword: temporaryPassword, newPassword: password }).expect(
      204,
    );
    return login({ email: CREDENTIALS.email, password }).expect(200);
  };

  const login = (payload: Record<string, unknown>) => http().post('/api/auth/login').send(payload);

  it('no hay registro publico', async () => {
    await http().post('/api/auth/register').send(CREDENTIALS).expect(404);
  });

  describe('contraseña provisoria del alta', () => {
    it('el primer login devuelve la sesion marcada para cambiar la contraseña', async () => {
      const { session } = await firstLogin();

      expect(session.user).toMatchObject({ email: 'dueno@negocio.test', mustChangePassword: true });
      expect(session).toHaveProperty('accessToken');
      expect(session).toHaveProperty('refreshToken');
    });

    it('hasta cambiarla solo deja usar /me y el cambio de contraseña', async () => {
      const { session } = await firstLogin();
      const auth = `Bearer ${session.accessToken}`;

      const blocked = await http().get('/api/businesses').set('Authorization', auth).expect(403);
      expect(blocked.body.errorCode).toBe('PASSWORD_CHANGE_REQUIRED');

      const me = await http().get('/api/auth/me').set('Authorization', auth).expect(200);
      expect(me.body.mustChangePassword).toBe(true);
    });

    it('al cambiarla libera la cuenta, sigue en esta sesion y cierra las demas', async () => {
      const { temporaryPassword, session } = await firstLogin();
      const other = await login({ email: CREDENTIALS.email, password: temporaryPassword }).expect(200);

      await changePassword(session.accessToken, {
        currentPassword: temporaryPassword,
        newPassword: CREDENTIALS.password,
      }).expect(204);

      const auth = `Bearer ${session.accessToken}`;
      await http().get('/api/businesses').set('Authorization', auth).expect(200);
      const me = await http().get('/api/auth/me').set('Authorization', auth).expect(200);
      expect(me.body.mustChangePassword).toBe(false);

      await http().get('/api/auth/me').set('Authorization', `Bearer ${other.body.accessToken}`).expect(401);
      await login({ email: CREDENTIALS.email, password: temporaryPassword }).expect(401);
      await login({ email: CREDENTIALS.email, password: CREDENTIALS.password }).expect(200);
    });

    it('rechaza una contraseña actual incorrecta, una igual a la actual y una corta', async () => {
      const { temporaryPassword, session } = await firstLogin();

      const wrong = await changePassword(session.accessToken, {
        currentPassword: 'noEsLaProvisoria1',
        newPassword: CREDENTIALS.password,
      }).expect(400);
      expect(wrong.body.errorCode).toBe('WRONG_CURRENT_PASSWORD');

      const same = await changePassword(session.accessToken, {
        currentPassword: temporaryPassword,
        newPassword: temporaryPassword,
      }).expect(400);
      expect(same.body.errorCode).toBe('SAME_PASSWORD');

      await changePassword(session.accessToken, { currentPassword: temporaryPassword, newPassword: 'corta' }).expect(
        400,
      );
    });

    it('guarda el password hasheado, nunca en texto plano', async () => {
      await register();

      const stored = await connection.collection('users').findOne({ email: 'dueno@negocio.test' });

      expect(stored?.password).toEqual(expect.stringMatching(/^\$2[aby]\$12\$/));
      expect(stored?.password).not.toBe(CREDENTIALS.password);
    });

    it('no trunca passwords largos (bcrypt corta a 72 bytes)', async () => {
      const password = `${'A'.repeat(72)}-sufijo-unico`;
      await register(password);

      await login({ email: CREDENTIALS.email, password }).expect(200);
      await login({ email: CREDENTIALS.email, password: 'A'.repeat(72) }).expect(401);
      await login({ email: CREDENTIALS.email, password: `${'A'.repeat(72)}-otro-sufijo` }).expect(401);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await register();
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

      const { body } = await register();
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Basic ${body.accessToken}`)
        .expect(401);
    });

    it('devuelve el usuario autenticado', async () => {
      const { body } = await register();

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ urn: body.user.urn, email: 'dueno@negocio.test', status: 'ACTIVE' });
      expect(response.body).not.toHaveProperty('password');
    });

    it('no acepta un refresh token como access token', async () => {
      const { body } = await register();

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${body.refreshToken}`)
        .expect(401);

      expect(response.body.errorCode).toBe('UNAUTHORIZED');
    });
  });

  describe('refresh', () => {
    it('entrega una sesion nueva a partir del refresh token', async () => {
      const { body } = await register();

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
      const { body } = await register();

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
