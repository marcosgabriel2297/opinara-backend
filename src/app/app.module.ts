import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, RouterModule } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from '@packages/admin';
import { AuthenticationModule } from '@packages/authentication';
import { BusinessesModule } from '@packages/businesses';
import { CampaignsModule } from '@packages/campaigns';
import { GoogleModule } from '@packages/google';
import { HealthModule } from '@packages/health';
import { LocationsModule } from '@packages/locations';
import { MembersModule } from '@packages/members';
import { PublicModule } from '@packages/public';
import { ReviewsModule } from '@packages/reviews';
import { CryptoModule } from '@shared/common/crypto';
import { FiltersModule } from '@shared/common/filters';
import { MailerModule } from '@shared/common/mailer';
import { AppThrottlerGuard } from '@shared/common/throttling';
import SharedConfig from '@shared/config';
import { validate } from '@shared/config/env.validation';
import { SharedModelsModule } from '@shared/models';

// GoogleModule y LocationsModule declaran rutas completas en sus controllers porque
// conviven bajo dos prefijos distintos (`/businesses/:businessUrn/...` y `/auth/google/...`).
const routers = [
  { path: 'admin', module: AdminModule },
  { path: 'auth', module: AuthenticationModule },
  { path: 'businesses', module: BusinessesModule },
  { path: 'health', module: HealthModule },
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate, cache: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('DATABASE_URI'),
        dbName: configService.get<string>('DATABASE_NAME') ?? SharedConfig.Mongo.Database,
      }),
    }),
    // Global para que cualquier guard pueda inyectar JwtService sin reimportarlo por modulo.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET_KEY'),
      }),
    }),
    // Habilita los cron de sincronizacion declarados en el paquete de reviews.
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: SharedConfig.Throttle.Ttl, limit: SharedConfig.Throttle.Limit }]),
    RouterModule.register(routers),
    CryptoModule,
    FiltersModule,
    MailerModule,
    SharedModelsModule,
    AdminModule,
    AuthenticationModule,
    BusinessesModule,
    GoogleModule,
    LocationsModule,
    ReviewsModule,
    CampaignsModule,
    PublicModule,
    MembersModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
