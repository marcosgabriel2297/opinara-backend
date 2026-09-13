import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EncryptedValue } from './encrypted-value';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Cifrado simetrico autenticado (AES-256-GCM) para secretos en reposo:
 * hoy los tokens de OAuth de Google. La clave viene de `TOKEN_ENCRYPTION_KEY` (base64, 32 bytes).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly keyVersion: number;

  constructor(configService: ConfigService) {
    this.key = Buffer.from(configService.getOrThrow<string>('TOKEN_ENCRYPTION_KEY'), 'base64');
    this.keyVersion = Number(configService.get<string>('TOKEN_ENCRYPTION_KEY_VERSION') ?? 1);

    if (this.key.length !== KEY_BYTES) {
      throw new Error(`TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes`);
    }
  }

  encrypt(plaintext: string): EncryptedValue {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.keyVersion,
    };
  }

  decrypt(value: EncryptedValue): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));

    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  /** Token aleatorio url-safe, usado para el `state` de OAuth y para slugs publicos. */
  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Comparacion en tiempo constante para secretos de igual proposito (no para passwords). */
  safeEquals(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');

    return left.length === right.length && timingSafeEqual(left, right);
  }
}
