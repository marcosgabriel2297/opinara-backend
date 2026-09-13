import { Module } from '@nestjs/common';

import { CampaignsModule } from '@packages/campaigns';
import { FeedbackModule } from '@packages/feedback';
import { LocationsModule } from '@packages/locations';

import * as Controllers from './controllers';
import * as Services from './services';

@Module({
  imports: [CampaignsModule, FeedbackModule, LocationsModule],
  controllers: [Controllers.Campaigns],
  providers: [Services.Campaigns],
})
export class PublicModule {}
