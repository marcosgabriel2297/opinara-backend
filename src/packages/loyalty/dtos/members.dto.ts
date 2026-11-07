import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
