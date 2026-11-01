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

  /** Proyección mínima para el `AdminGuard`: se ejecuta en cada request del panel. */
  findActiveByUrn(
    urn: string,
  ): Promise<Pick<Admin, 'urn' | 'email' | 'mustChangePassword' | 'passwordVersion'> | null> {
    return this.model
      .findOne({ urn, status: UserStatus.ACTIVE })
      .select('urn email mustChangePassword passwordVersion')
      .lean<Pick<Admin, 'urn' | 'email' | 'mustChangePassword' | 'passwordVersion'> | null>()
      .exec();
  }

  findByUrnWithPassword(urn: string): Promise<Admin | null> {
    return this.model.findOne({ urn }).select('+password').lean<Admin | null>().exec();
  }

  /** El password esta marcado `select: false`, hay que pedirlo explicitamente para el login. */
  findByEmailWithPassword(email: string): Promise<Admin | null> {
    return this.model.findOne({ email: email.toLowerCase().trim() }).select('+password').lean<Admin | null>().exec();
  }
}
