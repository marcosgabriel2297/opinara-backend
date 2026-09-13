import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LocationsModule } from '@packages/locations';

import * as Controllers from './controllers';
import { Campaign, CampaignSchema, CampaignsRepository, QRCode, QRCodeSchema, QRCodesRepository } from './models';
import * as Services from './services';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: QRCode.name, schema: QRCodeSchema },
    ]),
    LocationsModule,
  ],
  controllers: [Controllers.Campaigns],
  providers: [Services.Campaigns, CampaignsRepository, QRCodesRepository],
  // El paquete public resuelve campañas por slug para la landing anonima.
  exports: [Services.Campaigns, CampaignsRepository],
})
export class CampaignsModule {}
