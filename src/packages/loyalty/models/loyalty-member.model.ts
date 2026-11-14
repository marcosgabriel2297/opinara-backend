import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { EncryptedValue } from '@shared/common/crypto';
import { Entity } from '@shared/repositories';

export const LOYALTY_MEMBER_ENTITY = 'loyalty-member';

@Schema({ _id: false })
export class LoyaltyConsent {
  @Prop({ required: true })
  acceptedAt!: Date;

  /** Version de las condiciones aceptadas (ver `config.TermsVersion`). */
  @Prop({ required: true })
  termsVersion!: string;

  /** Acepto recibir promociones. Opcional y separado del alta. */
  @Prop({ required: true, default: false })
  marketing!: boolean;
}

const LoyaltyConsentSchema = SchemaFactory.createForClass(LoyaltyConsent);

@Schema({ _id: false })
class EncryptedCardToken implements EncryptedValue {
  @Prop({ required: true })
  ciphertext!: string;

  @Prop({ required: true })
  iv!: string;

  @Prop({ required: true })
  tag!: string;

  @Prop({ required: true })
  keyVersion!: number;
}

const EncryptedCardTokenSchema = SchemaFactory.createForClass(EncryptedCardToken);

export enum RemindersOptOutBy {
  /** Lo apago el cliente desde su tarjeta: solo el lo puede volver a prender. */
  CLIENT = 'CLIENT',
  /** Lo apago el local porque el cliente se lo pidio (por ejemplo, respondiendo el WhatsApp). */
  BUSINESS = 'BUSINESS',
}

@Schema({ _id: false })
export class RemindersOptOut {
  @Prop({ required: true })
  at!: Date;

  @Prop({ required: true, enum: RemindersOptOutBy })
  by!: RemindersOptOutBy;

  @Prop({ required: false })
  byUserUrn?: string;
}

const RemindersOptOutSchema = SchemaFactory.createForClass(RemindersOptOut);

/**
 * Un cliente del comercio y su tarjeta de sellos en un programa (una sucursal).
 *
 * Es la primera entidad con datos de consumidores finales: guarda lo minimo (nombre, celular y,
 * si quiere, email). Ni IP ni user agent.
 */
@Schema({ collection: 'loyalty_members', timestamps: true })
export class LoyaltyMember implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true })
  programUrn!: string;

  /**
   * Lo que codifica el QR de la tarjeta y lo que lee la caja. Solo sirve a alguien autenticado del
   * comercio: no da acceso a la tarjeta. Unico en el negocio, para que al escanear una tarjeta de
   * otra sucursal se pueda decir de cual es.
   */
  @Prop({ required: true, uppercase: true })
  memberCode!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** E.164 (`+5491123456789`). Unico por programa. */
  @Prop({ required: true })
  phone!: string;

  @Prop({ required: false, lowercase: true, trim: true })
  email?: string;

  /** sha256 del token del link de la tarjeta: es lo que se busca. */
  @Prop({ required: true, unique: true })
  cardTokenHash!: string;

  /** El mismo token cifrado, para reenviar el link por mail sin tener que cambiarlo. */
  @Prop({ type: EncryptedCardTokenSchema, required: true })
  cardToken!: EncryptedValue;

  /** Saldo actual. */
  @Prop({ required: true, default: 0, min: 0 })
  stamps!: number;

  @Prop({ required: true, default: 0 })
  totalStamps!: number;

  @Prop({ required: true, default: 0 })
  totalRedemptions!: number;

  @Prop({ required: false, type: Date, default: null })
  lastStampAt?: Date | null;

  /**
   * Cuando el local abrio WhatsApp para mandarle un recordatorio. Es lo mas que se sabe: con `wa.me`
   * no hay forma de confirmar que el mensaje se envio. Se le recomienda uno por vez que suma un sello.
   */
  @Prop({ required: false, type: Date, default: null })
  lastReminderAt?: Date | null;

  @Prop({ required: false })
  lastReminderByUserUrn?: string;

  /** No quiere recibir recordatorios por WhatsApp. Sin valor, se le pueden mandar. */
  @Prop({ type: RemindersOptOutSchema, required: false, default: null })
  remindersOptOut?: RemindersOptOut | null;

  @Prop({ type: LoyaltyConsentSchema, required: true })
  consent!: LoyaltyConsent;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type LoyaltyMemberDocument = HydratedDocument<LoyaltyMember>;
export const LoyaltyMemberSchema = SchemaFactory.createForClass(LoyaltyMember);

LoyaltyMemberSchema.index({ businessUrn: 1, programUrn: 1, phone: 1 }, { unique: true });
LoyaltyMemberSchema.index({ businessUrn: 1, memberCode: 1 }, { unique: true });
LoyaltyMemberSchema.index({ businessUrn: 1, programUrn: 1, createdAt: -1 });
