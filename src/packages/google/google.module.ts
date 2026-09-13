import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LocationsModule } from '@packages/locations';
import { GoogleIntegrationModule } from '@shared/integrations/google/exports';

import * as Controllers from './controllers';
import {
  GoogleConnection,
  GoogleConnectionSchema,
  GoogleConnectionsRepository,
  OAuthState,
  OAuthStateSchema,
  OAuthStatesRepository,
} from './models';
import * as Services from './services';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoogleConnection.name, schema: GoogleConnectionSchema },
      { name: OAuthState.name, schema: OAuthStateSchema },
    ]),
    GoogleIntegrationModule,
    LocationsModule,
  ],
  controllers: [Controllers.Connections, Controllers.OAuth],
  providers: [
    Services.Connections,
    Services.Profile,
    Services.Token,
    GoogleConnectionsRepository,
    OAuthStatesRepository,
  ],
  // `Token` lo va a usar el paquete de reviews para hablar con la API v4.
  exports: [Services.Token, GoogleConnectionsRepository],
})
export class GoogleModule {}
