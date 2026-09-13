import { existsSync } from 'fs';
import { resolve } from 'path';

import * as dotenv from 'dotenv';

/**
 * Carga el archivo de entorno segun NODE_ENV (.env.dev, .env.prod) y cae a `.env`.
 * Se importa al inicio de main.ts y de cualquier `config/index.ts` para garantizar
 * que `process.env` este poblado antes de construir los objetos de configuracion.
 */
const candidates = [`.env.${process.env.NODE_ENV ?? 'dev'}`, '.env'];

for (const candidate of candidates) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    dotenv.config({ path, quiet: true });
    break;
  }
}

const DEVELOPMENT_ENVIRONMENTS = new Set(['dev', 'development', 'test']);

/**
 * Solo es "desarrollo" si NODE_ENV lo dice explicitamente.
 * Todo lo demas -incluido NODE_ENV sin setear- se trata como produccion: las decisiones
 * que dependen de esto (CORS abierto, detalle de errores) fallan cerradas, no abiertas.
 */
export const isDevelopment = (): boolean => DEVELOPMENT_ENVIRONMENTS.has(process.env.NODE_ENV ?? '');

export const isProduction = (): boolean => !isDevelopment();
