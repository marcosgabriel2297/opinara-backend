import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const QR_CODE_ENTITY = 'qr-code';

/**
 * Registro de un QR generado. La imagen no se guarda: se renderiza a demanda desde
 * `targetUrl`, que es lo unico que el QR codifica.
 */
@Schema({ collection: 'qr_codes', timestamps: true })
export class QRCode implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true, index: true })
  campaignUrn!: string;

  @Prop({ required: true })
  targetUrl!: string;

  @Prop({ required: true })
  createdByUserUrn!: string;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type QRCodeDocument = HydratedDocument<QRCode>;
export const QRCodeSchema = SchemaFactory.createForClass(QRCode);
