import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { EncryptedValue } from '@shared/common/crypto';
import { GoogleConnectionStatus } from '@shared/models/enums/google';
import { Entity } from '@shared/repositories';

export const GOOGLE_CONNECTION_ENTITY = 'google-connection';

@Schema({ _id: false })
class EncryptedToken implements EncryptedValue {
  @Prop({ required: true })
  ciphertext!: string;

  @Prop({ required: true })
  iv!: string;

  @Prop({ required: true })
  tag!: string;

  @Prop({ required: true })
  keyVersion!: number;
}

const EncryptedTokenSchema = SchemaFactory.createForClass(EncryptedToken);

/**
 * Conexion OAuth de un business con su Google Business Profile.
 *
 * Los tokens se guardan cifrados (AES-256-GCM) y nunca se exponen por la API: los endpoints
 * devuelven `PublicGoogleConnection`, que no incluye ningun material criptografico.
 */
@Schema({ collection: 'google_connections', timestamps: true })
export class GoogleConnection implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  /** Un business tiene a lo sumo una conexion. */
  @Prop({ required: true, unique: true, index: true })
  businessUrn!: string;

  @Prop({ type: EncryptedTokenSchema, required: true })
  refreshToken!: EncryptedValue;

  @Prop({ type: EncryptedTokenSchema, required: false })
  accessToken?: EncryptedValue;

  @Prop({ required: false })
  accessTokenExpiresAt?: Date;

  @Prop({ type: [String], required: true, default: [] })
  scopes!: string[];

  @Prop({ required: true, enum: GoogleConnectionStatus, default: GoogleConnectionStatus.ACTIVE })
  status!: GoogleConnectionStatus;

  @Prop({ required: true })
  connectedByUserUrn!: string;

  @Prop({ required: false })
  connectedAt?: Date;

  @Prop({ required: false })
  revokedAt?: Date;

  @Prop({ required: false })
  lastSyncAt?: Date;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type GoogleConnectionDocument = HydratedDocument<GoogleConnection>;
export const GoogleConnectionSchema = SchemaFactory.createForClass(GoogleConnection);

/** Vista publica: sin tokens, sin material cifrado. */
export interface PublicGoogleConnection {
  urn: string;
  status: GoogleConnectionStatus;
  scopes: string[];
  connectedAt?: Date;
  lastSyncAt?: Date;
  connectedByUserUrn: string;
}

export const toPublicConnection = (connection: GoogleConnection): PublicGoogleConnection => ({
  urn: connection.urn,
  status: connection.status,
  scopes: connection.scopes,
  connectedAt: connection.connectedAt,
  lastSyncAt: connection.lastSyncAt,
  connectedByUserUrn: connection.connectedByUserUrn,
});
