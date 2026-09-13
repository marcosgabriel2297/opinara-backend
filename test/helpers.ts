import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface TestUser {
  urn: string;
  email: string;
  accessToken: string;
  auth: string;
}

let sequence = 0;

/** Registra un usuario nuevo y devuelve su sesion lista para usar en los headers. */
export const registerUser = async (app: INestApplication, email?: string): Promise<TestUser> => {
  sequence += 1;
  const address = email ?? `usuario-${sequence}@opinara.test`;

  const response = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: address, password: 'claveSuperSegura1', name: `Usuario ${sequence}` })
    .expect(201);

  return {
    urn: response.body.user.urn,
    email: response.body.user.email,
    accessToken: response.body.accessToken,
    auth: `Bearer ${response.body.accessToken}`,
  };
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
