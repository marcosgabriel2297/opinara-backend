import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { GoogleConnectionStatus, GoogleNotificationsStatus } from '@shared/models/enums/google';
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

  /** Conexiones activas de todos los tenants: solo para la reconciliacion de avisos. */
  findAllActive(): Promise<GoogleConnection[]> {
    return this.find({ status: GoogleConnectionStatus.ACTIVE }, { sort: { businessUrn: 'asc' } });
  }

  /** Reemplaza el estado de una cuenta sin tocar el de las demas. */
  async setNotificationStatus(
    businessUrn: string,
    accountName: string,
    status: GoogleNotificationsStatus,
  ): Promise<void> {
    const checkedAt = new Date();
    await this.updateOne({ businessUrn }, { $pull: { notificationAccounts: { accountName } } });
    await this.updateOne({ businessUrn }, { $push: { notificationAccounts: { accountName, status, checkedAt } } });
  }
}
