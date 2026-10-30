import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const SESSION_ENTITY = 'session';

/**
 * Una sesion iniciada (un login en un dispositivo). Los dos tokens llevan su URN en `sid`: el
 * `AuthGuard` y `/auth/refresh` la consultan, asi que revocarla corta el acceso en el acto, sin
 * esperar a que venzan los tokens. Antes "cerrar sesion" solo borraba los tokens del navegador:
 * quien los hubiera copiado los podia seguir usando 30 dias.
 *
 * Mongo borra las vencidas solo (indice TTL sobre `expiresAt`).
 */
@Schema({ collection: 'sessions', timestamps: true })
export class Session implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  userUrn!: string;

  /** Hasta cuando sirve el refresh token; se extiende con cada refresh. */
  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: false })
  revokedAt?: Date;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
