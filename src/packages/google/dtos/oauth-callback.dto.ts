import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query del callback de Google. Todo es opcional porque Google puede volver con `error`.
 *
 * El `ValidationPipe` global rechaza cualquier campo no declarado, así que acá tienen que estar
 * TODOS los que Google agrega a la redirección, aunque no se usen: `iss` (RFC 9207), `hd` (cuentas
 * de Workspace) y `error_description` / `error_uri` cuando vuelve con error. Si falta uno, el
 * dueño ve un 400 justo después de autorizar.
 */
export class OAuthCallbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  authuser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  iss?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  hd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  error_description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  error_uri?: string;
}
