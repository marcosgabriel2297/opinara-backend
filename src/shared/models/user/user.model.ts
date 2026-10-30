import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';
import { UserStatus } from '../enums/user';

export const USER_ENTITY = 'user';

/**
 * Usuario de la plataforma. La identidad es propia (email + password): el OAuth de Google
 * se usa solo para conectar el Google Business Profile de un business, no para autenticar.
 *
 * La pertenencia a businesses NO vive aca: se modela en `BusinessMember`, porque un usuario
 * puede pertenecer a varios businesses con distinto rol.
 */
@Schema({ collection: 'users', timestamps: true })
export class User implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  email!: string;

  /** Hash bcrypt. Nunca sale de la capa de servicios. */
  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  /**
   * El alta la hace un admin con una contraseña provisoria: hasta que el usuario elija la suya,
   * el `AuthGuard` solo le deja cambiarla (ver `AllowPendingPasswordChange`).
   */
  @Prop({ required: true, default: false })
  mustChangePassword!: boolean;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

/** Vista publica de un usuario: lo unico que puede cruzar la frontera HTTP. */
export interface PublicUser {
  urn: string;
  email: string;
  name: string;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt?: Date;
}

export const toPublicUser = (user: User): PublicUser => ({
  urn: user.urn,
  email: user.email,
  name: user.name,
  status: user.status,
  mustChangePassword: user.mustChangePassword ?? false,
  createdAt: user.createdAt,
});
