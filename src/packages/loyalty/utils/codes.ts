import { createHash, randomBytes } from 'crypto';

/** Sin 0/O ni 1/I: el cajero puede tener que dictarlo o tipearlo. 32 simbolos: cada byte % 32 es parejo. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MEMBER_CODE_LENGTH = 6;

/** Codigo de la tarjeta que lee la caja. ~10^9 combinaciones por negocio; el indice unico ataja el choque. */
export const generateMemberCode = (): string =>
  Array.from(randomBytes(MEMBER_CODE_LENGTH), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');

export const MEMBER_CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${MEMBER_CODE_LENGTH}}$`);

/** El secreto del link de la tarjeta. Solo se guarda su hash (para buscar) y una copia cifrada (para reenviarlo). */
export const generateCardToken = (): string => randomBytes(32).toString('base64url');

export const hashCardToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

export const CARD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
