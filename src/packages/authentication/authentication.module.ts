import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import * as Controllers from './controllers';
import { PasswordReset, PasswordResetSchema, PasswordResetsRepository } from './models';
import * as Services from './services';

@Module({
  // `UsersRepository` y `SessionsRepository` llegan por `SharedModelsModule`, que es global (los
  // necesita el AuthGuard). El mailer, por `MailerModule`, tambien global.
  imports: [MongooseModule.forFeature([{ name: PasswordReset.name, schema: PasswordResetSchema }])],
  controllers: [Controllers.Authentication],
  providers: [Services.Authentication, PasswordResetsRepository],
  exports: [Services.Authentication],
})
export class AuthenticationModule {}
