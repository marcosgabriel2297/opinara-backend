import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBusinessDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Opcional: si no viene, se deriva del nombre. Forma parte de la URL publica del QR. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase alphanumeric words separated by dashes' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
