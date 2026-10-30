import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const ADMIN_REVIEW_ORDERS = ['newest', 'oldest'] as const;
export type AdminReviewOrder = (typeof ADMIN_REVIEW_ORDERS)[number];

export const ADMIN_DEFAULT_PAGE_SIZE = 25;
export const ADMIN_MAX_PAGE_SIZE = 100;

/** Filtros de las reseñas de toda la plataforma. Sin `businessUrn`, son las de todos los negocios. */
export class AdminReviewFiltersDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessUrn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationUrn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  // La query string trae strings: la conversion implicita esta desactivada a proposito.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  hasReply?: boolean;

  /** Fecha de la reseña en Google, inclusive. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Fecha de la reseña en Google, exclusive. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Busca en el comentario y en el nombre de quien la dejo. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ListAdminReviewsDto extends AdminReviewFiltersDto {
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

  @IsOptional()
  @IsIn(ADMIN_REVIEW_ORDERS)
  order?: AdminReviewOrder;
}
