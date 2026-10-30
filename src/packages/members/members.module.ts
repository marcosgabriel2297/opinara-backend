import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import * as Controllers from './controllers';
import { BusinessInvitation, BusinessInvitationSchema, BusinessInvitationsRepository } from './models';
import * as Services from './services';

@Module({
  // Miembros, negocios y usuarios llegan por `SharedModelsModule`; el mailer, por `MailerModule`.
  imports: [MongooseModule.forFeature([{ name: BusinessInvitation.name, schema: BusinessInvitationSchema }])],
  controllers: [Controllers.BusinessMembers, Controllers.Invitations],
  providers: [Services.Members, BusinessInvitationsRepository],
})
export class MembersModule {}
