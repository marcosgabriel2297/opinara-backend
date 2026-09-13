import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BusinessMember, BusinessMemberSchema } from './business/business-member.model';
import { BusinessMembersRepository } from './business/business-members.repository';
import { Business, BusinessSchema } from './business/business.model';
import { BusinessesRepository } from './business/businesses.repository';
import { User, UserSchema } from './user/user.model';
import { UsersRepository } from './user/users.repository';

/**
 * Modelos que consultan los guards globales (`AuthGuard` y `BusinessMembershipGuard`) y que,
 * por lo tanto, necesita cualquier paquete con endpoints protegidos. Es el unico modulo
 * global de modelos: el resto de los paquetes registra sus propios schemas.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: BusinessMember.name, schema: BusinessMemberSchema },
    ]),
  ],
  providers: [UsersRepository, BusinessesRepository, BusinessMembersRepository],
  exports: [MongooseModule, UsersRepository, BusinessesRepository, BusinessMembersRepository],
})
export class SharedModelsModule {}
