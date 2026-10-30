import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';
import { BusinessMemberRole } from '@shared/models/enums/business';

export const BUSINESS_INVITATION_ENTITY = 'business-invitation';

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REVOKED = 'REVOKED',
}

/**
 * Una invitacion a sumarse a un business. Es para un email: solo la acepta quien inicio sesion
 * con ese email. El token viaja en el mail (y en el link que copia quien invita); aca queda su
 * SHA-256.
 */
@Schema({ collection: 'business_invitations', timestamps: true })
export class BusinessInvitation implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, enum: BusinessMemberRole })
  role!: BusinessMemberRole;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  invitedByUserUrn!: string;

  @Prop({ required: true, enum: InvitationStatus, default: InvitationStatus.PENDING })
  status!: InvitationStatus;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: false })
  acceptedByUserUrn?: string;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type BusinessInvitationDocument = HydratedDocument<BusinessInvitation>;
export const BusinessInvitationSchema = SchemaFactory.createForClass(BusinessInvitation);
BusinessInvitationSchema.index({ businessUrn: 1, email: 1, status: 1 });
