import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import config from '../config';

export const LOYALTY_MEMBERS_DEFAULT_PAGE_SIZE = 20;

export class ListLoyaltyMembersDto {
  /** Ultimos digitos del celular, el codigo de la tarjeta o parte del nombre. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RemoveLoyaltyStampsDto {
  /** Cuantos sellos sacar. */
  @IsInt()
  @Min(1)
  @Max(config.Program.MaxStampsRequired)
  stamps!: number;
}

export enum LoyaltyReminderReason {
  /** Le faltan 1 o 2 sellos y no vino hoy. */
  NEAR_REWARD = 'NEAR_REWARD',
  /** Hace `inactiveDays` dias o mas que no viene (o que se saco la tarjeta y no la estreno). */
  INACTIVE = 'INACTIVE',
}

export class ListLoyaltyRemindersDto {
  /** Solo los de un motivo. Sin esto, los dos. */
  @IsOptional()
  @IsEnum(LoyaltyReminderReason)
  reason?: LoyaltyReminderReason;

  /** Solo los de una sucursal. Sin esto, los de todas. */
  @IsOptional()
  @IsString()
  @Matches(/^urn:loyalty-program:[A-Za-z0-9-]{1,64}$/, { message: 'programUrn must be a valid loyalty program urn' })
  programUrn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SetLoyaltyRemindersDto {
  /** `false`: no quiere recibir mas recordatorios por WhatsApp. */
  @IsBoolean()
  enabled!: boolean;
}
