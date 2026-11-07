import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const AUDIT_EVENT_ENTITY = 'audit-event';

/** Lo que hizo un admin. Solo se agregan valores: los eventos viejos tienen que seguir leyéndose. */
export enum AuditAction {
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_PASSWORD_CHANGED = 'ADMIN_PASSWORD_CHANGED',
  ADMIN_CREATED = 'ADMIN_CREATED',
  ADMIN_DEACTIVATED = 'ADMIN_DEACTIVATED',
  ADMIN_REACTIVATED = 'ADMIN_REACTIVATED',
  USER_CREATED = 'USER_CREATED',
  USER_TEMPORARY_PASSWORD = 'USER_TEMPORARY_PASSWORD',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  USER_REACTIVATED = 'USER_REACTIVATED',
  BUSINESS_SUSPENDED = 'BUSINESS_SUSPENDED',
  BUSINESS_REACTIVATED = 'BUSINESS_REACTIVATED',
  BUSINESS_PLAN_CHANGED = 'BUSINESS_PLAN_CHANGED',
}

export enum AuditTargetType {
  ADMIN = 'ADMIN',
  USER = 'USER',
  BUSINESS = 'BUSINESS',
}

/**
 * Un evento del registro de auditoría del panel: quién, qué, sobre qué y cuándo.
 *
 * Guarda copias del email del admin y del nombre del objetivo (`targetLabel`): el registro tiene
 * que seguir siendo legible aunque después cambien o se borren. Nunca lleva contraseñas ni tokens.
 * No se edita ni se borra desde la aplicación.
 */
@Schema({ collection: 'admin_audit_events', timestamps: { createdAt: true, updatedAt: false } })
export class AuditEvent implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  adminUrn!: string;

  @Prop({ required: true })
  adminEmail!: string;

  @Prop({ required: true, enum: AuditAction, index: true })
  action!: AuditAction;

  @Prop({ required: true, enum: AuditTargetType })
  targetType!: AuditTargetType;

  @Prop({ required: true, index: true })
  targetUrn!: string;

  @Prop({ required: true })
  targetLabel!: string;

  declare createdAt?: Date;
}

export type AuditEventDocument = HydratedDocument<AuditEvent>;
export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);

// El listado: lo más nuevo primero.
AuditEventSchema.index({ createdAt: -1 });

export interface PublicAuditEvent {
  urn: string;
  admin: { urn: string; email: string };
  action: AuditAction;
  target: { type: AuditTargetType; urn: string; label: string };
  createdAt?: Date;
}

export const toPublicAuditEvent = (event: AuditEvent): PublicAuditEvent => ({
  urn: event.urn,
  admin: { urn: event.adminUrn, email: event.adminEmail },
  action: event.action,
  target: { type: event.targetType, urn: event.targetUrn, label: event.targetLabel },
  createdAt: event.createdAt,
});
