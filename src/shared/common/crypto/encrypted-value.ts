import { Prop, Schema } from '@nestjs/mongoose';

/**
 * Valor cifrado tal como se persiste. `keyVersion` permite rotar la clave
 * sin tener que descifrar todo el dataset de una sola vez.
 */
@Schema({ _id: false })
export class EncryptedValue {
  @Prop({ required: true })
  ciphertext!: string;

  @Prop({ required: true })
  iv!: string;

  @Prop({ required: true })
  tag!: string;

  @Prop({ required: true })
  keyVersion!: number;
}
