import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
