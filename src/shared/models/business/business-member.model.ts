import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';
import { BusinessMemberRole, BusinessMemberStatus } from '../enums/business';

export const BUSINESS_MEMBER_ENTITY = 'business-member';

/**
 * Relacion N:N entre usuarios y businesses: un usuario puede pertenecer a varios negocios
 * con distinto rol. Es la fuente de verdad de la autorizacion multi-tenant.
 */
@Schema({ collection: 'business_members', timestamps: true })
export class BusinessMember implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true, index: true })
  userUrn!: string;

  @Prop({ required: true, enum: BusinessMemberRole })
  role!: BusinessMemberRole;

  @Prop({ required: true, enum: BusinessMemberStatus, default: BusinessMemberStatus.ACTIVE })
  status!: BusinessMemberStatus;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type BusinessMemberDocument = HydratedDocument<BusinessMember>;
export const BusinessMemberSchema = SchemaFactory.createForClass(BusinessMember);

// Un usuario no puede estar dos veces en el mismo business.
BusinessMemberSchema.index({ businessUrn: 1, userUrn: 1 }, { unique: true });
