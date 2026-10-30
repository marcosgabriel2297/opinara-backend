import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import * as Controllers from './controllers';
import { LogoBodyMiddleware } from './middlewares';
import { BusinessLogo, BusinessLogoSchema, BusinessLogosRepository } from './models';
import * as Services from './services';

@Module({
  // Los repositorios de tenancy llegan por `TenancyModule`, que es global.
  imports: [MongooseModule.forFeature([{ name: BusinessLogo.name, schema: BusinessLogoSchema }])],
  controllers: [Controllers.Businesses, Controllers.BusinessLogo],
  providers: [Services.Businesses, Services.BusinessLogos, BusinessLogosRepository],
  exports: [Services.Businesses, Services.BusinessLogos],
})
export class BusinessesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LogoBodyMiddleware).forRoutes(Controllers.BusinessLogo);
  }
}
