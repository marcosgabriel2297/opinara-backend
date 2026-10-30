import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { LogoContentType, LOGO_CONTENT_TYPES } from '../logo-image';

/**
 * El logo de un business, en su propia coleccion: el business se carga en cada request (lo usa
 * el guard de membresia) y no tiene por que arrastrar la imagen. En `Business` queda solo
 * `logoUpdatedAt`, que versiona la URL publica.
 *
 * Se guarda en Mongo porque es una imagen chica (el frontend la achica antes de subirla, y el
 * backend corta en `LOGO_MAX_BYTES`). Si algun dia hace falta un almacenamiento de objetos, cambia
 * este repositorio y nada mas: la URL publica es la misma.
 */
@Schema({ collection: 'business_logos', timestamps: true })
export class BusinessLogo {
  @Prop({ required: true, unique: true, index: true })
  businessUrn!: string;

  @Prop({ required: true, type: Buffer })
  data!: Buffer;

  @Prop({ required: true, enum: LOGO_CONTENT_TYPES })
  contentType!: LogoContentType;

  declare updatedAt?: Date;
}

export type BusinessLogoDocument = HydratedDocument<BusinessLogo>;
export const BusinessLogoSchema = SchemaFactory.createForClass(BusinessLogo);
