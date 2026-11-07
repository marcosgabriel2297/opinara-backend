import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import config from '../config';
import { LoyaltyProgramStatus } from '../models';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateLoyaltyProgramDto {
  /** Un programa por sucursal. */
  @IsString()
  @Matches(/^urn:location:[A-Za-z0-9-]{1,64}$/, { message: 'locationUrn must be a valid location urn' })
  locationUrn!: string;

  /** Va en la URL impresa (`/f/{negocio}/{slug}`). Si no viene, sale del nombre de la sucursal. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase alphanumeric words separated by dashes' })
  slug?: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  rewardDescription!: string;

  @IsOptional()
  @IsInt()
  @Min(config.Program.MinStampsRequired)
  @Max(config.Program.MaxStampsRequired)
  stampsRequired?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  terms?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(config.Program.MaxStampCooldownMinutes)
  stampCooldownMinutes?: number;
}

/** El slug y la sucursal no se cambian: el QR ya puede estar impreso. */
export class UpdateLoyaltyProgramDto {
  @IsOptional()
  @IsEnum(LoyaltyProgramStatus)
  status?: LoyaltyProgramStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  rewardDescription?: string;

  @IsOptional()
  @IsInt()
  @Min(config.Program.MinStampsRequired)
  @Max(config.Program.MaxStampsRequired)
  stampsRequired?: number;

  /** Vacio borra las condiciones. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  terms?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(config.Program.MaxStampCooldownMinutes)
  stampCooldownMinutes?: number;
}
