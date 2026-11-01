import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { AuditAction } from '../models/audit-event.model';

import { ADMIN_MAX_PAGE_SIZE } from './admin-reviews.dto';

export class ListAuditDto {
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adminUrn?: string;

  /** Todo lo que se hizo sobre un usuario, negocio o admin. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetUrn?: string;

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
