import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { GoogleModule } from '@packages/google';
import { LocationsModule } from '@packages/locations';
import { GoogleIntegrationModule } from '@shared/integrations/google/exports';
import { TextGenerationIntegrationModule } from '@shared/integrations/text-generation/exports';

import * as Controllers from './controllers';
import { Review, ReviewSchema, ReviewsRepository } from './models';
import * as Services from './services';
import { REPLY_SUGGESTER, ReplySuggesterService, ReviewSyncScheduler } from './services';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    // GoogleModule aporta el proveedor de access tokens; la integracion, el cliente de la API v4.9.
    GoogleModule,
    GoogleIntegrationModule,
    // El modelo de lenguaje de las respuestas sugeridas: el adaptador lo elige `LLM_PROVIDER`.
    TextGenerationIntegrationModule,
    LocationsModule,
  ],
  controllers: [Controllers.Reviews, Controllers.BusinessReviews, Controllers.Sync],
  providers: [
    Services.Reviews,
    Services.Sync,
    ReviewSyncScheduler,
    ReviewsRepository,
    { provide: REPLY_SUGGESTER, useClass: ReplySuggesterService },
  ],
  exports: [Services.Reviews, Services.Sync, ReviewsRepository],
})
export class ReviewsModule {}
