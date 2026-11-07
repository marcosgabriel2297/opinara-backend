import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Un email vacio del formulario cuenta como "no lo dejo". */
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value;

/** Los slugs se validan antes de tocar la base: son la unica entrada de un endpoint anonimo. */
export class LoyaltyProgramParamsDto {
  @IsString()
  @Matches(SLUG, { message: 'invalid business slug' })
  businessSlug!: string;

  @IsString()
  @Matches(SLUG, { message: 'invalid program slug' })
  programSlug!: string;
}

export class RegisterLoyaltyMemberDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** Obligatorio: es lo que busca la caja y lo que evita tarjetas duplicadas. Se normaliza a E.164. */
  @IsString()
  @MaxLength(30)
  phone!: string;

  /** Opcional: sirve para recuperar el link de la tarjeta. */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /** Acepta la politica de privacidad y las condiciones del programa. Sin esto no hay alta. */
  @IsBoolean()
  @Equals(true, { message: 'acceptTerms must be true' })
  acceptTerms!: boolean;

  /** Acepta recibir promociones. Aparte del alta y opcional. */
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  /** Campo trampa: el formulario lo esconde, asi que solo lo completa un bot. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class ResendLoyaltyCardDto extends LoyaltyProgramParamsDto {
  @IsString()
  @MaxLength(30)
  phone!: string;
}
