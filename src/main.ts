import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import SharedConfig from '@shared/config';
import { isProduction } from '@shared/environment';
import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const production = isProduction();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: production ? ['log', 'error', 'warn'] : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  if (SharedConfig.App.TrustProxy !== undefined) {
    app.set('trust proxy', SharedConfig.App.TrustProxy);
  }

  app.use(helmet());
  // Sin origenes configurados: abierto en desarrollo, cerrado en produccion.
  app.enableCors({
    origin: SharedConfig.App.CorsOrigins.length > 0 ? SharedConfig.App.CorsOrigins : !production,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.setGlobalPrefix(SharedConfig.App.Prefix);

  await app.listen(SharedConfig.App.Port);
  logger.log(`Opinara backend listening on port ${SharedConfig.App.Port}`);
}

void bootstrap();
