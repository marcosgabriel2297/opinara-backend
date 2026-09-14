import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';

describe('Businesses (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let owner: TestUser;

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp());
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    owner = await registerUser(app);
  });

  afterEach(async () => {
    await Promise.all([
      connection.collection('users').deleteMany({}),
      connection.collection('businesses').deleteMany({}),
      connection.collection('business_members').deleteMany({}),
    ]);
  });

  describe('creacion', () => {
    it('crea el business y deja al creador como OWNER', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/businesses')
        .set('Authorization', owner.auth)
        .send({ name: 'Café de la Esquina', timezone: 'America/Argentina/Buenos_Aires' })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Café de la Esquina', slug: 'cafe-de-la-esquina', role: 'OWNER' });
      expect(response.body.urn).toMatch(/^urn:business:/);

      const membership = await connection.collection('business_members').findOne({ businessUrn: response.body.urn });
      expect(membership).toMatchObject({ userUrn: owner.urn, role: 'OWNER', status: 'ACTIVE' });
    });

    it('acepta un slug explicito y rechaza formatos invalidos', async () => {
      const { slug } = await createBusiness(app, owner, { name: 'Mi Negocio', slug: 'sucursal-centro' });
      expect(slug).toBe('sucursal-centro');

      await request(app.getHttpServer())
        .post('/api/businesses')
        .set('Authorization', owner.auth)
        .send({ name: 'Otro', slug: 'Con Mayusculas Y Espacios' })
        .expect(400);
    });

    it('pide un slug explicito cuando del nombre no sale ninguno', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/businesses')
        .set('Authorization', owner.auth)
        .send({ name: '🍕🍕🍕' })
        .expect(400);

      expect(response.body.errorCode).toBe('SLUG_NOT_DERIVABLE');
    });

    it('rechaza un slug ya tomado, incluso por otro usuario', async () => {
      await createBusiness(app, owner, { name: 'Panaderia Central' });
      const otro = await registerUser(app);

      const response = await request(app.getHttpServer())
        .post('/api/businesses')
        .set('Authorization', otro.auth)
        .send({ name: 'Panaderia Central' })
        .expect(409);

      expect(response.body.errorCode).toBe('BUSINESS_SLUG_ALREADY_EXISTS');
    });

    it('devuelve 409, no 500, ante creaciones concurrentes con el mismo slug', async () => {
      const create = () =>
        request(app.getHttpServer())
          .post('/api/businesses')
          .set('Authorization', owner.auth)
          .send({ name: 'Bar Simultaneo' });

      const statuses = (await Promise.all([create(), create(), create(), create()])).map((r) => r.status).sort();

      expect(statuses).toEqual([201, 409, 409, 409]);
      expect(await connection.collection('businesses').countDocuments({ slug: 'bar-simultaneo' })).toBe(1);
    });

    it('exige autenticacion', async () => {
      await request(app.getHttpServer()).post('/api/businesses').send({ name: 'Sin token' }).expect(401);
      await request(app.getHttpServer()).get('/api/businesses').expect(401);
    });
  });

  describe('aislamiento entre tenants', () => {
    it('el listado solo devuelve los businesses propios', async () => {
      await createBusiness(app, owner, { name: 'Negocio A' });
      const intruso = await registerUser(app);
      await createBusiness(app, intruso, { name: 'Negocio B' });

      const propios = await request(app.getHttpServer())
        .get('/api/businesses')
        .set('Authorization', owner.auth)
        .expect(200);

      expect(propios.body).toHaveLength(1);
      expect(propios.body[0]).toMatchObject({ name: 'Negocio A', role: 'OWNER' });
      expect(JSON.stringify(propios.body)).not.toContain('Negocio B');
    });

    it('un usuario ajeno recibe 404 -no 403- al pedir un business que no es suyo', async () => {
      const { urn } = await createBusiness(app, owner, { name: 'Negocio Privado' });
      const intruso = await registerUser(app);

      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${urn}`)
        .set('Authorization', intruso.auth)
        .expect(404);

      // Un 403 confirmaria que ese business existe y permitiria enumerarlos.
      expect(response.body.errorCode).toBe('BUSINESS_NOT_FOUND');
      expect(JSON.stringify(response.body)).not.toContain('Negocio Privado');
    });

    it('la respuesta de un business inexistente es identica a la de uno ajeno', async () => {
      const { urn } = await createBusiness(app, owner, { name: 'Negocio Privado' });
      const intruso = await registerUser(app);

      const ajeno = await request(app.getHttpServer())
        .get(`/api/businesses/${urn}`)
        .set('Authorization', intruso.auth)
        .expect(404);
      const inexistente = await request(app.getHttpServer())
        .get('/api/businesses/urn:business:00000000-0000-0000-0000-000000000000')
        .set('Authorization', intruso.auth)
        .expect(404);

      expect(inexistente.body.errorCode).toBe(ajeno.body.errorCode);
      expect(inexistente.body.message).toBe(ajeno.body.message);
    });

    it('rechaza urns malformados o de otra entidad', async () => {
      for (const urn of ['no-es-un-urn', 'urn:user:123', '../../auth/me', 'urn:business:']) {
        await request(app.getHttpServer())
          .get(`/api/businesses/${encodeURIComponent(urn)}`)
          .set('Authorization', owner.auth)
          .expect(404);
      }
    });

    it('deja de dar acceso cuando la membresia se revoca', async () => {
      const { urn } = await createBusiness(app, owner, { name: 'Negocio Revocado' });

      await request(app.getHttpServer()).get(`/api/businesses/${urn}`).set('Authorization', owner.auth).expect(200);

      await connection
        .collection('business_members')
        .updateOne({ businessUrn: urn, userUrn: owner.urn }, { $set: { status: 'REVOKED' } });

      await request(app.getHttpServer()).get(`/api/businesses/${urn}`).set('Authorization', owner.auth).expect(404);
      const listado = await request(app.getHttpServer())
        .get('/api/businesses')
        .set('Authorization', owner.auth)
        .expect(200);
      expect(listado.body).toHaveLength(0);
    });

    it('corta el acceso de un usuario desactivado o borrado aunque su token siga vigente', async () => {
      const { urn } = await createBusiness(app, owner, { name: 'Negocio del Empleado' });

      await connection.collection('users').updateOne({ urn: owner.urn }, { $set: { status: 'INACTIVE' } });

      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', owner.auth).expect(401);
      await request(app.getHttpServer()).get(`/api/businesses/${urn}`).set('Authorization', owner.auth).expect(401);
      await request(app.getHttpServer())
        .post('/api/businesses')
        .set('Authorization', owner.auth)
        .send({ name: 'Creado por inactivo' })
        .expect(401);

      await connection.collection('users').deleteOne({ urn: owner.urn });

      await request(app.getHttpServer()).get(`/api/businesses/${urn}`).set('Authorization', owner.auth).expect(401);
      expect(await connection.collection('businesses').countDocuments({ slug: 'creado-por-inactivo' })).toBe(0);
    });

    it('bloquea con 403 los endpoints de un business suspendido', async () => {
      const { urn } = await createBusiness(app, owner, { name: 'Negocio Suspendido' });

      await connection.collection('businesses').updateOne({ urn }, { $set: { status: 'SUSPENDED' } });

      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${urn}`)
        .set('Authorization', owner.auth)
        .expect(403);

      expect(response.body.errorCode).toBe('BUSINESS_SUSPENDED');
    });

    it('un miembro invitado ve el business con su propio rol', async () => {
      const { urn } = await createBusiness(app, owner, { name: 'Negocio Compartido' });
      const invitado = await registerUser(app);

      await connection.collection('business_members').insertOne({
        urn: 'urn:business-member:invitado',
        businessUrn: urn,
        userUrn: invitado.urn,
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      const response = await request(app.getHttpServer())
        .get(`/api/businesses/${urn}`)
        .set('Authorization', invitado.auth)
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Negocio Compartido', role: 'MEMBER' });
    });
  });
});
