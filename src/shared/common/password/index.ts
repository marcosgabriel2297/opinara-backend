import { createHash, randomBytes } from 'crypto';

import * as bcrypt from 'bcrypt';

/** Coste de bcrypt: balance entre seguridad y latencia del login. */
const SALT_ROUNDS = 12;

/**
 * Hash descartable con el que se compara cuando el email no existe, para que el login
 * tarde lo mismo con un email valido que con uno inexistente (evita enumeracion por timing).
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7tAP8Xm1VDrCDwvXiSmQbGgqQnhq8Vu';

/**
 * bcrypt trunca silenciosamente a 72 bytes: sin esto, dos passwords que comparten los
 * primeros 72 bytes serian intercambiables al iniciar sesion. Pre-hashear con SHA-256 deja
 * siempre 44 caracteres, sin limite de longitud para el usuario.
 */
const prepare = (password: string): string => createHash('sha256').update(password, 'utf8').digest('base64');

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(prepare(password), SALT_ROUNDS);

/** Sin `hash` (cuenta inexistente) compara igual contra `DUMMY_HASH` y devuelve `false`. */
export const comparePassword = async (password: string, hash: string | undefined): Promise<boolean> => {
  const matches = await bcrypt.compare(prepare(password), hash ?? DUMMY_HASH);
  return hash !== undefined && matches;
};

/** Contraseña provisoria del alta: 16 caracteres url-safe, ~96 bits de entropia. */
export const generatePassword = (): string => randomBytes(12).toString('base64url');
