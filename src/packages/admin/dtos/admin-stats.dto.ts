import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { ADMIN_MAX_PAGE_SIZE } from './admin-reviews.dto';

export class OverviewQueryDto {
  /** Cuántas semanas de evolución, la actual incluida. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  weeks?: number;
}

export class ScansQueryDto extends OverviewQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessUrn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationUrn?: string;
}

export class LoyaltyQueryDto extends OverviewQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessUrn?: string;
}

/** Clientes de la tarjeta de sellos de toda la plataforma, de un negocio o de una sucursal. */
export class ListLoyaltyMembersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessUrn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationUrn?: string;

  /** Nombre, email, código de la tarjeta o los últimos dígitos del celular. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
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
  @Max(ADMIN_MAX_PAGE_SIZE)
  limit?: number;
}
