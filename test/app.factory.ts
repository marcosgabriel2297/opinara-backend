import { randomBytes } from 'crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

import { startMemoryMongo, stopMemoryMongo } from './mongo-memory';

export interface ProviderOverride {
  token: unknown;
  value: unknown;
}

export interface TestApp {
  app: INestApplication;
  connection: Connection;
  close: () => Promise<void>;
}

/**
 * Levanta la aplicacion completa contra un Mongo efimero.
 * El entorno se setea ANTES de importar AppModule porque ConfigModule valida al cargar.
 */
export const createTestApp = async (
  env: Record<string, string> = {},
  overrides: ProviderOverride[] = [],
): Promise<TestApp> => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URI = await startMemoryMongo();
  process.env.DATABASE_NAME = 'opinara-test';
  process.env.JWT_SECRET_KEY = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET_KEY = 'test-refresh-secret';
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  // Los tests hacen muchas llamadas seguidas desde la misma IP: el rate limit se prueba aparte.
  process.env.THROTTLE_LIMIT = '10000';
  process.env.AUTH_THROTTLE_LIMIT = '10000';
  process.env.GOOGLE_CALLBACK_THROTTLE_LIMIT = '10000';
  process.env.PUBLIC_THROTTLE_LIMIT = '10000';

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const { AppModule } = await import('../src/app/app.module');

  // Las integraciones externas se reemplazan por dobles: ningun test toca la red.
  const builder = overrides.reduce(
    (acc, override) => acc.overrideProvider(override.token).useValue(override.value),
    Test.createTestingModule({ imports: [AppModule] }),
  );

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();

  const connection = moduleRef.get<Connection>(getConnectionToken());

  return {
    app,
    connection,
    close: async () => {
      await app.close();
      await stopMemoryMongo();
    },
  };
};
