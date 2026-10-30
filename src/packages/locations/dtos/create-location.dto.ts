import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Alta manual de una sucursal, para operar sin acceso a las APIs de Google.
 *
 * El placeId es obligatorio porque de el sale el link de reseña, que es lo unico que el
 * circuito del QR necesita de Google. Se valida con el formato de Place ID (alfanumerico,
 * `-` y `_`) y no como texto libre: viaja a una URL que se le muestra al cliente final.
 */
export class CreateLocationDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{10,255}$/, { message: 'placeId must be a valid Google Place ID' })
  placeId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  storeCode?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  address?: string;
}
