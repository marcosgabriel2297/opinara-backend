import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import * as Controllers from './controllers';
import { Location, LocationSchema, LocationsRepository } from './models';
import * as Services from './services';

@Module({
  imports: [MongooseModule.forFeature([{ name: Location.name, schema: LocationSchema }])],
  controllers: [Controllers.Locations],
  providers: [Services.Locations, LocationsRepository],
  // El paquete google importa este modulo para persistir lo que trae de la API.
  exports: [Services.Locations, LocationsRepository],
})
export class LocationsModule {}
