import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { UserStatus } from '@shared/models/enums/user';
import { Entity } from '@shared/repositories';

export const ADMIN_ENTITY = 'admin';

/**
 * Administrador de la plataforma: da de alta a los usuarios (no hay registro publico). Es una
 * identidad aparte de `User`: no pertenece a ningun business y su token no sirve contra la API
 * de los usuarios, ni el de un usuario contra la suya.
 */
@Schema({ collection: 'admins', timestamps: true })
export class Admin implements Entity {
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

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type AdminDocument = HydratedDocument<Admin>;
export const AdminSchema = SchemaFactory.createForClass(Admin);

export interface PublicAdmin {
  urn: string;
  email: string;
  name: string;
}

export const toPublicAdmin = (admin: Admin): PublicAdmin => ({ urn: admin.urn, email: admin.email, name: admin.name });
