import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { GoogleConnectionStatus } from '@shared/models/enums/google';
import { DatabaseRepository } from '@shared/repositories';
import { GoogleConnection } from './google-connection.model';

@Injectable()
export class GoogleConnectionsRepository extends DatabaseRepository<GoogleConnection> {
  constructor(@InjectModel(GoogleConnection.name) model: Model<GoogleConnection>) {
    super(model);
  }

  findByBusiness(businessUrn: string): Promise<GoogleConnection | null> {
    return this.findOne({ businessUrn });
  }

  findActiveByBusiness(businessUrn: string): Promise<GoogleConnection | null> {
    return this.findOne({ businessUrn, status: GoogleConnectionStatus.ACTIVE });
  }
}
