import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Location a la que apunta el QR: el link de Google es por sucursal. */
  @IsString()
  @Matches(/^urn:location:[A-Za-z0-9-]{1,64}$/, { message: 'locationUrn must be a valid location urn' })
  locationUrn!: string;

  /** Si no viene, se deriva del nombre. Unico dentro del negocio. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase alphanumeric words separated by dashes' })
  slug?: string;
}
