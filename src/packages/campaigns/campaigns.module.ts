import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LocationsModule } from '@packages/locations';

import * as Controllers from './controllers';
import {
  Campaign,
  CampaignSchema,
  CampaignsRepository,
  QRCode,
  QRCodeSchema,
  QRCodesRepository,
  ScanEvent,
  ScanEventSchema,
  ScanEventsRepository,
} from './models';
import * as Services from './services';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: QRCode.name, schema: QRCodeSchema },
      { name: ScanEvent.name, schema: ScanEventSchema },
    ]),
    LocationsModule,
  ],
  controllers: [Controllers.Campaigns, Controllers.BusinessScans],
  providers: [Services.Campaigns, CampaignsRepository, QRCodesRepository, ScanEventsRepository],
  // El paquete public resuelve campañas por slug para la landing anonima y registra los escaneos.
  exports: [Services.Campaigns, CampaignsRepository, ScanEventsRepository],
})
export class CampaignsModule {}
