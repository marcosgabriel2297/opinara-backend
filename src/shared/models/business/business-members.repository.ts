import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { BusinessMemberStatus } from '../enums/business';
import { BusinessMember } from './business-member.model';

@Injectable()
export class BusinessMembersRepository extends DatabaseRepository<BusinessMember> {
  constructor(@InjectModel(BusinessMember.name) model: Model<BusinessMember>) {
    super(model);
  }

  /** Membresia activa de un usuario en un business: la consulta que autoriza cada request. */
  findActiveMembership(businessUrn: string, userUrn: string): Promise<BusinessMember | null> {
    return this.findOne({ businessUrn, userUrn, status: BusinessMemberStatus.ACTIVE });
  }

  findActiveByUser(userUrn: string): Promise<BusinessMember[]> {
    return this.find({ userUrn, status: BusinessMemberStatus.ACTIVE }, { sort: { createdAt: 'asc' } });
  }
}
