import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const LOYALTY_EVENT_ENTITY = 'loyalty-event';

export enum LoyaltyEventType {
  STAMP = 'STAMP',
  REDEMPTION = 'REDEMPTION',
}

/**
 * Historial de sellos y canjes: para auditar quien hizo que, deshacer y graficar. No tiene datos
 * personales; si el cliente borra los suyos, sus eventos quedan con el `memberUrn` y nada mas.
 */
@Schema({ collection: 'loyalty_events', timestamps: { createdAt: true, updatedAt: false } })
export class LoyaltyEvent implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true })
  businessUrn!: string;

  @Prop({ required: true })
  programUrn!: string;

  /** Copiado del programa, para agregar por sucursal sin joins. */
  @Prop({ required: true })
  locationUrn!: string;

  @Prop({ required: true })
  memberUrn!: string;

  @Prop({ required: true, enum: LoyaltyEventType })
  type!: LoyaltyEventType;

  /** Sellos que movio: 1 en un sello, los que pide el premio en un canje. */
  @Prop({ required: true })
  amount!: number;

  /** Quien lo hizo desde la caja. */
  @Prop({ required: true })
  byUserUrn!: string;

  @Prop({ required: false, type: Date, default: null })
  undoneAt?: Date | null;

  @Prop({ required: false })
  undoneByUserUrn?: string;

  declare createdAt?: Date;
}

export type LoyaltyEventDocument = HydratedDocument<LoyaltyEvent>;
export const LoyaltyEventSchema = SchemaFactory.createForClass(LoyaltyEvent);

LoyaltyEventSchema.index({ businessUrn: 1, programUrn: 1, createdAt: -1 });
LoyaltyEventSchema.index({ businessUrn: 1, memberUrn: 1, createdAt: -1 });
