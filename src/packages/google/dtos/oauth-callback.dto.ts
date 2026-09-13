import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Query del callback de Google. Todo es opcional porque Google puede volver con `error`. */
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
}
