import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { UserStatus } from '@shared/models/enums/user';
import { DatabaseRepository } from '@shared/repositories';

import { Admin } from './admin.model';

@Injectable()
export class AdminsRepository extends DatabaseRepository<Admin> {
  constructor(@InjectModel(Admin.name) model: Model<Admin>) {
    super(model);
  }

  findActiveByUrn(urn: string): Promise<Pick<Admin, 'urn' | 'email'> | null> {
    return this.model
      .findOne({ urn, status: UserStatus.ACTIVE })
      .select('urn email')
      .lean<Pick<Admin, 'urn' | 'email'> | null>()
      .exec();
  }

  /** El password esta marcado `select: false`, hay que pedirlo explicitamente para el login. */
  findByEmailWithPassword(email: string): Promise<Admin | null> {
    return this.model.findOne({ email: email.toLowerCase().trim() }).select('+password').lean<Admin | null>().exec();
  }
}
