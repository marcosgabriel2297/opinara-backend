import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { TEST_PASSWORD, createAdmin, registerUser } from '../../../test/helpers';

describe('Administracion (integracion)', () => {
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
    await Promise.all(['users', 'admins', 'sessions'].map((name) => connection.collection(name).deleteMany({})));
  });

  const http = () => request(app.getHttpServer());
  const createUser = (auth: string | undefined, payload: Record<string, unknown>) => {
    const call = http().post('/api/admin/users').send(payload);
    return auth === undefined ? call : call.set('Authorization', auth);
  };

  describe('login', () => {
    it('autentica al admin y no devuelve el password', async () => {
      await createAdmin(app);

      const response = await http()
        .post('/api/admin/auth/login')
        .send({ email: 'ADMIN@opinara.test', password: TEST_PASSWORD })
        .expect(200);

      expect(response.body.admin).toMatchObject({ email: 'admin@opinara.test' });
      expect(response.body).toHaveProperty('accessToken');
      expect(JSON.stringify(response.body)).not.toContain('password');
    });

    it('rechaza password incorrecto, email inexistente y admin inactivo con el mismo error', async () => {
      await createAdmin(app);
      const wrong = await http()
        .post('/api/admin/auth/login')
        .send({ email: 'admin@opinara.test', password: 'otraClave123' })
        .expect(401);
      const unknown = await http()
        .post('/api/admin/auth/login')
        .send({ email: 'nadie@opinara.test', password: TEST_PASSWORD })
        .expect(401);

      await connection.collection('admins').updateOne({}, { $set: { status: 'INACTIVE' } });
      const inactive = await http()
        .post('/api/admin/auth/login')
        .send({ email: 'admin@opinara.test', password: TEST_PASSWORD })
        .expect(401);

      for (const response of [wrong, unknown, inactive]) {
        expect(response.body.errorCode).toBe('WRONG_CREDENTIALS');
      }
    });

    it('un usuario no puede entrar como admin', async () => {
      const user = await registerUser(app, 'dueno@opinara.test');

      await http().post('/api/admin/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(401);
    });
  });

  describe('alta de usuarios', () => {
    it('crea el usuario con una contraseña provisoria que sirve para entrar', async () => {
      const adminAuth = await createAdmin(app);

      const response = await createUser(adminAuth, { email: 'Nuevo@Negocio.test', name: ' Nuevo Usuario ' }).expect(
        201,
      );

      expect(response.body.user).toMatchObject({
        email: 'nuevo@negocio.test',
        name: 'Nuevo Usuario',
        status: 'ACTIVE',
        mustChangePassword: true,
      });
      expect(response.body.user.urn).toMatch(/^urn:user:/);
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);

      const stored = await connection.collection('users').findOne({ email: 'nuevo@negocio.test' });
      expect(stored?.password).not.toBe(response.body.temporaryPassword);

      const login = await http()
        .post('/api/auth/login')
        .send({ email: 'nuevo@negocio.test', password: response.body.temporaryPassword })
        .expect(200);
      expect(login.body.user.mustChangePassword).toBe(true);
    });

    it('exige el token de un admin: sin token, con token de usuario o de un admin inactivo es 401', async () => {
      const adminAuth = await createAdmin(app);
      const user = await registerUser(app);
      const payload = { email: 'nuevo@negocio.test', name: 'Nuevo' };

      await createUser(undefined, payload).expect(401);
      await createUser(user.auth, payload).expect(401);

      await connection.collection('admins').updateOne({}, { $set: { status: 'INACTIVE' } });
      await createUser(adminAuth, payload).expect(401);

      expect(await connection.collection('users').countDocuments({ email: 'nuevo@negocio.test' })).toBe(0);
    });

    it('el token del admin no sirve contra la API de los usuarios', async () => {
      const adminAuth = await createAdmin(app);

      await http().get('/api/auth/me').set('Authorization', adminAuth).expect(401);
    });

    it('rechaza un email ya registrado, tambien ante altas concurrentes', async () => {
      const adminAuth = await createAdmin(app);
      const payload = { email: 'nuevo@negocio.test', name: 'Nuevo' };

      const responses = await Promise.all([1, 2, 3].map(() => createUser(adminAuth, payload)));

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409]);
      expect(responses.find((response) => response.status === 409)?.body.errorCode).toBe('EMAIL_ALREADY_EXISTS');
      expect(JSON.stringify(responses.map((response) => response.body))).not.toContain('E11000');
    });

    it('valida el cuerpo y no acepta campos extra', async () => {
      const adminAuth = await createAdmin(app);

      await createUser(adminAuth, { email: 'no-es-un-email', name: 'Nuevo' }).expect(400);
      await createUser(adminAuth, { email: 'nuevo@negocio.test', name: 'N' }).expect(400);
      const extra = await createUser(adminAuth, {
        email: 'nuevo@negocio.test',
        name: 'Nuevo',
        mustChangePassword: false,
      }).expect(400);
      expect(extra.body.message).toContain('mustChangePassword');
    });
  });
});
