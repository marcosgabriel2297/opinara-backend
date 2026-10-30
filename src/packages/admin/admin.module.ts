import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Location, LocationSchema } from '@packages/locations';
import { Review, ReviewSchema } from '@packages/reviews';

import * as Controllers from './controllers';
import { AdminGuard } from './guards';
import { Admin, AdminReviewsRepository, AdminSchema, AdminsRepository } from './models';
import * as Services from './services';

@Module({
  // `UsersRepository` y el modelo de `Business` llegan por `SharedModelsModule`, que es global. Reseñas y
  // sucursales se registran aca para leerlas sin filtrar por negocio, que sus repositorios no permiten.
  imports: [
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [Controllers.Admin, Controllers.Reports],
  providers: [Services.Admin, Services.Reports, AdminsRepository, AdminReviewsRepository, AdminGuard],
})
export class AdminModule {}
