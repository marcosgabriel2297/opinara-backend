import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { BusinessInvitation, InvitationStatus } from './business-invitation.model';

@Injectable()
export class BusinessInvitationsRepository extends DatabaseRepository<BusinessInvitation> {
  constructor(@InjectModel(BusinessInvitation.name) model: Model<BusinessInvitation>) {
    super(model);
  }

  findPending(businessUrn: string, now: Date = new Date()): Promise<BusinessInvitation[]> {
    return this.find(
      { businessUrn, status: InvitationStatus.PENDING, expiresAt: { $gt: now } },
      { sort: { createdAt: 'asc' } },
    );
  }

  findByTokenHash(tokenHash: string): Promise<BusinessInvitation | null> {
    return this.findOne({ tokenHash });
  }

  /** Invitar de nuevo al mismo email deja sin efecto la invitacion anterior. */
  async revokePendingFor(businessUrn: string, email: string): Promise<void> {
    await this.model
      .updateMany(
        { businessUrn, email, status: InvitationStatus.PENDING },
        { $set: { status: InvitationStatus.REVOKED } },
      )
      .exec();
  }

  /** La pasa a aceptada solo si seguia pendiente: dos aceptaciones simultaneas no suman dos veces. */
  markAccepted(urn: string, userUrn: string): Promise<BusinessInvitation | null> {
    return this.updateOne(
      { urn, status: InvitationStatus.PENDING },
      { $set: { status: InvitationStatus.ACCEPTED, acceptedByUserUrn: userUrn } },
    );
  }
}
