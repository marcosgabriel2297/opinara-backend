import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { TEST_PASSWORD, createAdmin, createBusiness, registerUser } from '../../../test/helpers';

const COLLECTIONS = ['users', 'admins', 'sessions', 'businesses', 'business_members', 'admin_audit_events'];

describe('Acciones del administrador y auditoría (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let adminAuth: string;

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp());
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    adminAuth = await createAdmin(app);
  });

  afterEach(async () => {
    await Promise.all(COLLECTIONS.map((name) => connection.collection(name).deleteMany({})));
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, auth = adminAuth, body?: object) => {
    const call = http().post(path).set('Authorization', auth);
    return body === undefined ? call : call.send(body);
  };
  const get = (path: string, auth = adminAuth) => http().get(path).set('Authorization', auth);
  const audit = async (query = '') =>
    (await get(`/api/admin/audit${query}`).expect(200)).body as {
      total: number;
      items: { action: string; admin: { email: string }; target: { type: string; urn: string; label: string } }[];
    };

  describe('usuarios', () => {
    it('desactivar corta el acceso en el acto; reactivar lo devuelve; todo queda auditado', async () => {
      const user = await registerUser(app, 'dueno@opinara.test');
      const urn = encodeURIComponent(user.urn);

      const off = await post(`/api/admin/users/${urn}/deactivate`).expect(200);
      expect(off.body).toMatchObject({ urn: user.urn, status: 'INACTIVE' });
      await http().get('/api/auth/me').set('Authorization', user.auth).expect(401);
      const login = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(403);
      expect(login.body.errorCode).toBe('USER_INACTIVE');

      // Repetirlo no cambia nada ni deja otro evento.
      await post(`/api/admin/users/${urn}/deactivate`).expect(200);

      await post(`/api/admin/users/${urn}/reactivate`).expect(200);
      await http().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);

      const events = await audit(`?targetUrn=${urn}`);
      expect(events.items.map((event) => event.action)).toEqual(['USER_REACTIVATED', 'USER_DEACTIVATED']);
      expect(events.items[0]).toMatchObject({
        admin: { email: 'admin@opinara.test' },
        target: { type: 'USER', urn: user.urn, label: 'dueno@opinara.test' },
      });
    });

    it('el alta y la contraseña provisoria también se auditan, sin guardar la contraseña', async () => {
      const created = await post('/api/admin/users', adminAuth, { email: 'nuevo@opinara.test', name: 'Nuevo' }).expect(
        201,
      );
      await post(`/api/admin/users/${encodeURIComponent(created.body.user.urn)}/temporary-password`).expect(200);

      const events = await audit();
      expect(events.items.map((event) => event.action)).toEqual(
        expect.arrayContaining(['USER_CREATED', 'USER_TEMPORARY_PASSWORD']),
      );
      const stored = await connection.collection('admin_audit_events').find({}).toArray();
      expect(JSON.stringify(stored)).not.toContain(created.body.temporaryPassword);
    });

    it('un usuario inexistente es 404', async () => {
      const response = await post('/api/admin/users/urn:user:no-existe/deactivate').expect(404);
      expect(response.body.errorCode).toBe('USER_NOT_FOUND');
    });
  });

  describe('negocios', () => {
    it('suspender corta el dashboard del equipo; reactivar lo devuelve; queda auditado', async () => {
      const owner = await registerUser(app, 'dueno@opinara.test');
      const business = await createBusiness(app, owner, { name: 'Café de la Esquina' });
      const urn = encodeURIComponent(business.urn);

      const suspended = await post(`/api/admin/businesses/${urn}/suspend`).expect(200);
      expect(suspended.body).toMatchObject({ urn: business.urn, status: 'SUSPENDED' });
      const blocked = await http().get(`/api/businesses/${urn}`).set('Authorization', owner.auth).expect(403);
      expect(blocked.body.errorCode).toBe('BUSINESS_SUSPENDED');

      await post(`/api/admin/businesses/${urn}/reactivate`).expect(200);
      await http().get(`/api/businesses/${urn}`).set('Authorization', owner.auth).expect(200);

      const events = await audit(`?targetUrn=${urn}`);
      expect(events.items.map((event) => [event.action, event.target.label])).toEqual([
        ['BUSINESS_REACTIVATED', 'Café de la Esquina'],
        ['BUSINESS_SUSPENDED', 'Café de la Esquina'],
      ]);
    });

    it('un negocio inexistente es 404', async () => {
      await post('/api/admin/businesses/urn:business:no-existe/suspend').expect(404);
    });
  });

  describe('administradores', () => {
    it('da de alta otro admin que, hasta cambiar la contraseña, solo puede hacer eso', async () => {
      const created = await post('/api/admin/admins', adminAuth, {
        email: 'Otra@Opinara.test',
        name: 'Otra Admin',
      }).expect(201);
      expect(created.body.admin).toMatchObject({
        email: 'otra@opinara.test',
        mustChangePassword: true,
        status: 'ACTIVE',
      });
      await post('/api/admin/admins', adminAuth, { email: 'otra@opinara.test', name: 'Repetida' }).expect(409);

      const login = await http()
        .post('/api/admin/auth/login')
        .send({ email: 'otra@opinara.test', password: created.body.temporaryPassword })
        .expect(200);
      expect(login.body.admin.mustChangePassword).toBe(true);
      const auth = `Bearer ${login.body.accessToken}`;

      const blocked = await get('/api/admin/reviews', auth).expect(403);
      expect(blocked.body.errorCode).toBe('PASSWORD_CHANGE_REQUIRED');
      await get('/api/admin/me', auth).expect(200);

      const changed = await post('/api/admin/me/password', auth, {
        currentPassword: created.body.temporaryPassword,
        newPassword: 'otraClaveSegura1',
      }).expect(200);
      expect(changed.body.admin.mustChangePassword).toBe(false);

      // El token viejo deja de servir; el nuevo sí.
      await get('/api/admin/me', auth).expect(401);
      await get('/api/admin/reviews', `Bearer ${changed.body.accessToken}`).expect(200);

      const list = await get('/api/admin/admins').expect(200);
      expect(list.body.map((admin: { email: string }) => admin.email).sort()).toEqual([
        'admin@opinara.test',
        'otra@opinara.test',
      ]);
    });

    it('cambiar la propia contraseña pide la actual y que sea distinta', async () => {
      const wrong = await post('/api/admin/me/password', adminAuth, {
        currentPassword: 'noEsLaMia1',
        newPassword: 'otraClaveSegura1',
      }).expect(400);
      expect(wrong.body.errorCode).toBe('WRONG_CURRENT_PASSWORD');

      const same = await post('/api/admin/me/password', adminAuth, {
        currentPassword: TEST_PASSWORD,
        newPassword: TEST_PASSWORD,
      }).expect(400);
      expect(same.body.errorCode).toBe('SAME_PASSWORD');

      await post('/api/admin/me/password', adminAuth, { currentPassword: TEST_PASSWORD, newPassword: 'corta' }).expect(
        400,
      );
    });

    it('desactivar otro admin corta su acceso; nadie se desactiva a sí mismo', async () => {
      const otherAuth = await createAdmin(app, 'otra@opinara.test');
      const other = (await get('/api/admin/me', otherAuth).expect(200)).body as { urn: string };
      const me = (await get('/api/admin/me').expect(200)).body as { urn: string };

      const self = await post(`/api/admin/admins/${encodeURIComponent(me.urn)}/deactivate`).expect(400);
      expect(self.body.errorCode).toBe('CANNOT_DEACTIVATE_SELF');

      await post(`/api/admin/admins/${encodeURIComponent(other.urn)}/deactivate`).expect(200);
      await get('/api/admin/me', otherAuth).expect(401);

      await post(`/api/admin/admins/${encodeURIComponent(other.urn)}/reactivate`).expect(200);
      await post('/api/admin/admins/urn:admin:no-existe/reactivate').expect(404);

      const events = await audit('?action=ADMIN_DEACTIVATED');
      expect(events.total).toBe(1);
      expect(events.items[0]!.target.label).toBe('otra@opinara.test');
    });
  });

  describe('registro de auditoría', () => {
    it('anota cada login de un admin, filtra y valida', async () => {
      const events = await audit('?action=ADMIN_LOGIN');
      expect(events.total).toBe(1);
      await get('/api/admin/audit?action=CUALQUIERA').expect(400);
    });

    it('solo con el token de un admin', async () => {
      const user = await registerUser(app);
      await http().get('/api/admin/audit').expect(401);
      await get('/api/admin/audit', user.auth).expect(401);
    });
  });
});
