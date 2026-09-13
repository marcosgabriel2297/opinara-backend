import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, validateSync } from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Dev = 'dev',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsOptional()
  @IsEnum(NodeEnvironment)
  NODE_ENV?: NodeEnvironment;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URI!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET_KEY!: string;

  @IsString()
  @IsNotEmpty()
  TOKEN_ENCRYPTION_KEY!: string;
}

const KEY_BYTES = 32;

/**
 * Valida las variables de entorno al bootstrap: si falta algo critico la app no arranca,
 * en vez de fallar mas tarde en runtime con un error opaco.
 */
export const validate = (config: Record<string, unknown>): Record<string, unknown> => {
  const parsed = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(parsed, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const details = errors.map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`);
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }

  const keyLength = Buffer.from(parsed.TOKEN_ENCRYPTION_KEY, 'base64').length;
  if (keyLength !== KEY_BYTES) {
    throw new Error(
      `Invalid environment configuration:\nTOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} bytes encoded in base64 (got ${keyLength})`,
    );
  }

  return config;
};
