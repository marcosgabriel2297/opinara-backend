import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { TEST_PASSWORD, createAdmin, createBusiness, registerUser } from '../../../test/helpers';

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
    await Promise.all(
      ['users', 'admins', 'sessions', 'businesses', 'business_members'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
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

  describe('listado de usuarios', () => {
    const list = (auth: string, query = '') => http().get(`/api/admin/users${query}`).set('Authorization', auth);

    it('lista el mas nuevo primero, con sus negocios y si le falta cambiar la contraseña', async () => {
      const adminAuth = await createAdmin(app);
      const owner = await registerUser(app, 'dueno@opinara.test');
      await createBusiness(app, owner, { name: 'Café de la Esquina' });
      await createUser(adminAuth, { email: 'nuevo@opinara.test', name: 'Nuevo Usuario' }).expect(201);

      const response = await list(adminAuth).expect(200);

      expect(response.body).toMatchObject({ page: 0, limit: 25, total: 2 });
      expect(response.body.items[0]).toMatchObject({
        email: 'nuevo@opinara.test',
        mustChangePassword: true,
        businesses: [],
      });
      expect(response.body.items[1]).toMatchObject({
        email: 'dueno@opinara.test',
        mustChangePassword: false,
        businesses: [{ name: 'Café de la Esquina', role: 'OWNER' }],
      });
      expect(JSON.stringify(response.body)).not.toContain('password"');
    });

    it('busca por email o nombre, literal, y pagina', async () => {
      const adminAuth = await createAdmin(app);
      await registerUser(app, 'ana@opinara.test');
      await registerUser(app, 'bruno@opinara.test');
      await createUser(adminAuth, { email: 'carla@negocio.test', name: 'Carla Ruiz' }).expect(201);

      expect((await list(adminAuth, '?search=RUIZ').expect(200)).body.total).toBe(1);
      expect((await list(adminAuth, '?search=opinara.test').expect(200)).body.total).toBe(2);
      expect((await list(adminAuth, '?search=.*').expect(200)).body.total).toBe(0);

      const second = await list(adminAuth, '?limit=2&page=1').expect(200);
      expect(second.body).toMatchObject({ page: 1, limit: 2, total: 3 });
      expect(second.body.items).toHaveLength(1);
    });

    it('solo con el token del admin', async () => {
      const user = await registerUser(app);

      await http().get('/api/admin/users').expect(401);
      await list(user.auth).expect(401);
    });
  });

  describe('otra contraseña provisoria', () => {
    const reset = (auth: string | undefined, urn: string) => {
      const call = http().post(`/api/admin/users/${encodeURIComponent(urn)}/temporary-password`);
      return auth === undefined ? call : call.set('Authorization', auth);
    };

    it('reemplaza la contraseña, obliga a cambiarla y cierra las sesiones abiertas', async () => {
      const adminAuth = await createAdmin(app);
      const user = await registerUser(app, 'dueno@opinara.test');

      const response = await reset(adminAuth, user.urn).expect(200);

      expect(response.body.user).toMatchObject({ urn: user.urn, mustChangePassword: true });
      expect(response.body.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
      expect(response.body.user).not.toHaveProperty('password');

      await http().get('/api/auth/me').set('Authorization', user.auth).expect(401);
      await http().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(401);
      const login = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: response.body.temporaryPassword })
        .expect(200);
      expect(login.body.user.mustChangePassword).toBe(true);
    });

    it('un usuario inexistente es 404, y sin token de admin es 401', async () => {
      const adminAuth = await createAdmin(app);
      const user = await registerUser(app);

      const missing = await reset(adminAuth, 'urn:user:00000000-0000-4000-8000-000000000000').expect(404);
      expect(missing.body.errorCode).toBe('USER_NOT_FOUND');
      await reset(undefined, user.urn).expect(401);
      await reset(user.auth, user.urn).expect(401);
    });
  });
});
