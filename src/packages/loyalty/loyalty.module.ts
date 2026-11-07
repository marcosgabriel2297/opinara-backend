import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LocationsModule } from '@packages/locations';

import * as Controllers from './controllers';
import {
  LoyaltyEvent,
  LoyaltyEventSchema,
  LoyaltyEventsRepository,
  LoyaltyMember,
  LoyaltyMemberSchema,
  LoyaltyMembersRepository,
  LoyaltyProgram,
  LoyaltyProgramSchema,
  LoyaltyProgramsRepository,
} from './models';
import * as Services from './services';

/**
 * Fidelizacion: tarjeta de sellos web por sucursal (ver `FIDELIZACION.md`). Incluye su propia
 * superficie publica (`/public/loyalty`) para quedar autocontenido; no depende de las reseñas ni
 * las reseñas de el.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoyaltyProgram.name, schema: LoyaltyProgramSchema },
      { name: LoyaltyMember.name, schema: LoyaltyMemberSchema },
      { name: LoyaltyEvent.name, schema: LoyaltyEventSchema },
    ]),
    LocationsModule,
  ],
  controllers: [Controllers.Programs, Controllers.Members, Controllers.Public],
  providers: [
    Services.Programs,
    Services.Members,
    Services.Public,
    Services.CardMailer,
    LoyaltyProgramsRepository,
    LoyaltyMembersRepository,
    LoyaltyEventsRepository,
  ],
})
export class LoyaltyModule {}
