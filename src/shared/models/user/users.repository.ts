import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { UserStatus } from '../enums/user';
import { User } from './user.model';

@Injectable()
export class UsersRepository extends DatabaseRepository<User> {
  constructor(@InjectModel(User.name) model: Model<User>) {
    super(model);
  }

  /** Proyeccion minima para el AuthGuard: se ejecuta en cada request autenticado. */
  findActiveByUrn(urn: string): Promise<Pick<User, 'urn' | 'email' | 'status'> | null> {
    return this.model
      .findOne({ urn, status: UserStatus.ACTIVE })
      .select('urn email status')
      .lean<Pick<User, 'urn' | 'email' | 'status'> | null>()
      .exec();
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email: email.toLowerCase().trim() });
  }

  /** El password esta marcado `select: false`, hay que pedirlo explicitamente para el login. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.model.findOne({ email: email.toLowerCase().trim() }).select('+password').lean<User | null>().exec();
  }
}
