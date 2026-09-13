import { Module } from '@nestjs/common';

import * as Controllers from './controllers';
import * as Services from './services';

@Module({
  // `UsersRepository` llega por `SharedModelsModule`, que es global (lo necesita el AuthGuard).
  controllers: [Controllers.Authentication],
  providers: [Services.Authentication],
  exports: [Services.Authentication],
})
export class AuthenticationModule {}
