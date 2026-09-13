import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const OAUTH_STATE_ENTITY = 'oauth-state';

/**
 * `state` del flujo OAuth: liga el callback al usuario y business que lo iniciaron (anti-CSRF).
 *
 * Se guarda el hash SHA-256, no el valor: si la base se filtra, los states no sirven.
 * Es de un solo uso -se borra al consumirlo- y ademas expira solo por indice TTL.
 */
@Schema({ collection: 'oauth_states', timestamps: true })
export class OAuthState implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, unique: true, index: true })
  stateHash!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true })
  userUrn!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type OAuthStateDocument = HydratedDocument<OAuthState>;
export const OAuthStateSchema = SchemaFactory.createForClass(OAuthState);

// Mongo borra solo los states vencidos aunque nadie complete el flujo.
OAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
