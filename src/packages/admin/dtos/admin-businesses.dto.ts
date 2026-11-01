import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { BusinessStatus } from '@shared/models/enums/business';

import { ADMIN_MAX_PAGE_SIZE } from './admin-reviews.dto';

export const ADMIN_BUSINESS_ORDERS = ['newest', 'name'] as const;
export type AdminBusinessOrder = (typeof ADMIN_BUSINESS_ORDERS)[number];

export class ListAdminBusinessesDto {
  /** Busca en el nombre y el slug. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus;

  /** `connected`: con la conexión de Google activa; `not_connected`: sin conexión o revocada. */
  @IsOptional()
  @IsIn(['connected', 'not_connected'])
  google?: 'connected' | 'not_connected';

  @IsOptional()
  @IsIn(ADMIN_BUSINESS_ORDERS)
  order?: AdminBusinessOrder;

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
