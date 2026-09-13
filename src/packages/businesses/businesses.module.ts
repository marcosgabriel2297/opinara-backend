import { Module } from '@nestjs/common';

import * as Controllers from './controllers';
import * as Services from './services';

@Module({
  // Los repositorios de tenancy llegan por `TenancyModule`, que es global.
  controllers: [Controllers.Businesses],
  providers: [Services.Businesses],
  exports: [Services.Businesses],
})
export class BusinessesModule {}
