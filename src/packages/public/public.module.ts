import { Module } from '@nestjs/common';

import { BusinessesModule } from '@packages/businesses';
import { CampaignsModule } from '@packages/campaigns';
import { LocationsModule } from '@packages/locations';

import * as Controllers from './controllers';
import * as Services from './services';

@Module({
  imports: [BusinessesModule, CampaignsModule, LocationsModule],
  controllers: [Controllers.Campaigns, Controllers.BusinessLogo],
  providers: [Services.Campaigns],
})
export class PublicModule {}
