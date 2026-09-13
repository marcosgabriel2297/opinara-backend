import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { GoogleModule } from '@packages/google';
import { LocationsModule } from '@packages/locations';
import { GoogleIntegrationModule } from '@shared/integrations/google/exports';

import * as Controllers from './controllers';
import { Review, ReviewSchema, ReviewsRepository } from './models';
import * as Services from './services';
import { ReviewSyncScheduler } from './services';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    // GoogleModule aporta el proveedor de access tokens; la integracion, el cliente de la API v4.9.
    GoogleModule,
    GoogleIntegrationModule,
    LocationsModule,
  ],
  controllers: [Controllers.Reviews, Controllers.Sync],
  providers: [Services.Reviews, Services.Sync, ReviewSyncScheduler, ReviewsRepository],
  exports: [Services.Reviews, Services.Sync, ReviewsRepository],
})
export class ReviewsModule {}
