import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const LOYALTY_PROGRAM_ENTITY = 'loyalty-program';

export enum LoyaltyProgramStatus {
  ACTIVE = 'ACTIVE',
  /** No admite altas ni sellos; las tarjetas se siguen viendo. */
  PAUSED = 'PAUSED',
}

@Schema({ _id: false })
export class LoyaltyProgramStats {
  /** Clientes con tarjeta (baja si alguno borra sus datos). */
  @Prop({ required: true, default: 0 })
  members!: number;

  @Prop({ required: true, default: 0 })
  stamps!: number;

  @Prop({ required: true, default: 0 })
  redemptions!: number;
}

const LoyaltyProgramStatsSchema = SchemaFactory.createForClass(LoyaltyProgramStats);

/**
 * Programa de fidelizacion de una sucursal: "con N sellos, tal premio". Uno por sucursal; la
 * tarjeta de un cliente vale solo en la sucursal de su programa.
 */
@Schema({ collection: 'loyalty_programs', timestamps: true })
export class LoyaltyProgram implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true })
  locationUrn!: string;

  /** Segunda parte de la URL del QR de alta: `/f/{businessSlug}/{slug}`. Una vez impresa no se cambia. */
  @Prop({ required: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, enum: LoyaltyProgramStatus, default: LoyaltyProgramStatus.ACTIVE })
  status!: LoyaltyProgramStatus;

  @Prop({ required: true })
  stampsRequired!: number;

  /** "Un café gratis". */
  @Prop({ required: true, trim: true })
  rewardDescription!: string;

  /** Condiciones en texto libre ("no acumulable con otras promociones"). */
  @Prop({ required: false, trim: true })
  terms?: string;

  @Prop({ required: true })
  stampCooldownMinutes!: number;

  /**
   * Plantilla del recordatorio por WhatsApp (ver `config.Reminders`). Sin valor, se usa la
   * recomendada: asi, si mejoramos el texto recomendado, les llega a todos los que no lo cambiaron.
   */
  @Prop({ required: false, trim: true })
  reminderMessage?: string;

  /** Dias sin venir para recomendar el recordatorio "te extrañamos". Sin valor, `DefaultInactiveDays`. */
  @Prop({ required: false })
  inactiveDays?: number;

  /** Plantilla del "te extrañamos". Sin valor, la recomendada (`DefaultInactiveMessage`). */
  @Prop({ required: false, trim: true })
  inactiveReminderMessage?: string;

  @Prop({
    type: LoyaltyProgramStatsSchema,
    required: true,
    default: () => ({ members: 0, stamps: 0, redemptions: 0 }),
  })
  stats!: LoyaltyProgramStats;

  @Prop({ required: true })
  createdByUserUrn!: string;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type LoyaltyProgramDocument = HydratedDocument<LoyaltyProgram>;
export const LoyaltyProgramSchema = SchemaFactory.createForClass(LoyaltyProgram);

LoyaltyProgramSchema.index({ businessUrn: 1, locationUrn: 1 }, { unique: true });
LoyaltyProgramSchema.index({ businessUrn: 1, slug: 1 }, { unique: true });
