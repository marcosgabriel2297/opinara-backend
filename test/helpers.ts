import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';

import { hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';

export interface TestUser {
  urn: string;
  email: string;
  accessToken: string;
  auth: string;
}

export const TEST_PASSWORD = 'claveSuperSegura1';

let sequence = 0;
/** El hash es caro (bcrypt): se calcula una vez y lo comparten todos los usuarios de prueba. */
let passwordHash: Promise<string> | undefined;

const collection = (app: INestApplication, name: string) => app.get<Connection>(getConnectionToken()).collection(name);

/**
 * Crea un usuario ya activo (como si un admin lo hubiera dado de alta y el usuario ya hubiera
 * elegido su contraseña) y devuelve su sesion lista para usar en los headers. No hay registro
 * publico: el alta por el admin se prueba en `admin.spec.ts`.
 */
export const registerUser = async (app: INestApplication, email?: string): Promise<TestUser> => {
  sequence += 1;
  const address = (email ?? `usuario-${sequence}@opinara.test`).toLowerCase();

  passwordHash ??= hashPassword(TEST_PASSWORD);
  await collection(app, 'users').insertOne({
    urn: Urn.createUUID('user'),
    email: address,
    name: `Usuario ${sequence}`,
    password: await passwordHash,
    status: 'ACTIVE',
    mustChangePassword: false,
  });

  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: address, password: TEST_PASSWORD })
    .expect(200);

  return {
    urn: response.body.user.urn,
    email: response.body.user.email,
    accessToken: response.body.accessToken,
    auth: `Bearer ${response.body.accessToken}`,
  };
};

/** Crea un administrador y devuelve el header con su token. */
export const createAdmin = async (app: INestApplication, email = 'admin@opinara.test'): Promise<string> => {
  passwordHash ??= hashPassword(TEST_PASSWORD);
  await collection(app, 'admins').insertOne({
    urn: Urn.createUUID('admin'),
    email,
    name: 'Admin',
    password: await passwordHash,
    status: 'ACTIVE',
  });

  const response = await request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);

  return `Bearer ${response.body.accessToken}`;
};

export const createBusiness = async (
  app: INestApplication,
  user: TestUser,
  payload: Record<string, unknown>,
): Promise<{ urn: string; slug: string }> => {
  const response = await request(app.getHttpServer())
    .post('/api/businesses')
    .set('Authorization', user.auth)
    .send(payload)
    .expect(201);

  return { urn: response.body.urn, slug: response.body.slug };
};
