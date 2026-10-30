import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Un pedido de "me olvide la contraseña". El token viaja solo en el mail; aca queda su SHA-256,
 * asi que quien lea la base no puede usarlo. Sirve una vez y vence (`expiresAt`, con indice TTL
 * para que Mongo los borre solo).
 */
@Schema({ collection: 'password_resets', timestamps: true })
export class PasswordReset {
  @Prop({ required: true, index: true })
  userUrn!: string;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: false })
  usedAt?: Date;
}

export type PasswordResetDocument = HydratedDocument<PasswordReset>;
export const PasswordResetSchema = SchemaFactory.createForClass(PasswordReset);
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
