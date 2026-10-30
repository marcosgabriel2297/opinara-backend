import { IsIn, IsOptional, IsString } from 'class-validator';

import { ListReviewsQueryDto } from './list-reviews.dto';

export const REVIEW_ORDERS = ['newest', 'oldest'] as const;
export type ReviewOrder = (typeof REVIEW_ORDERS)[number];

/**
 * El listado de todas las sucursales del negocio. `oldest` es el orden de la fila de respuesta:
 * primero la que más espera.
 */
export class ListBusinessReviewsQueryDto extends ListReviewsQueryDto {
  @IsOptional()
  @IsString()
  locationUrn?: string;

  @IsOptional()
  @IsIn(REVIEW_ORDERS)
  order?: ReviewOrder;
}
