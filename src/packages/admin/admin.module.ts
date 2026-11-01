import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Campaign, CampaignSchema, ScanEvent, ScanEventSchema } from '@packages/campaigns';
import { GoogleConnection, GoogleConnectionSchema } from '@packages/google';
import { Location, LocationSchema } from '@packages/locations';
import { Review, ReviewSchema } from '@packages/reviews';

import * as Controllers from './controllers';
import { AdminGuard } from './guards';
import { Admin, AdminReviewsRepository, AdminSchema, AdminsRepository } from './models';
import * as Services from './services';

@Module({
  // `UsersRepository` y los modelos de `User` y `Business` llegan por `SharedModelsModule`, que es global.
  // El resto se registra aca para leerlo sin filtrar por negocio, que sus repositorios no permiten.
  imports: [
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: ScanEvent.name, schema: ScanEventSchema },
      { name: GoogleConnection.name, schema: GoogleConnectionSchema },
    ]),
  ],
  controllers: [Controllers.Admin, Controllers.Reports],
  providers: [Services.Admin, Services.Reports, Services.Stats, AdminsRepository, AdminReviewsRepository, AdminGuard],
})
export class AdminModule {}
