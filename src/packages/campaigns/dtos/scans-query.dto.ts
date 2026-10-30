import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_SCAN_WEEKS = 12;
export const MAX_SCAN_WEEKS = 52;

export class ScansQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SCAN_WEEKS)
  weeks?: number;
}
