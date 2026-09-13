import { randomBytes } from 'crypto';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { CryptoService } from './crypto.service';

const KEY = randomBytes(32).toString('base64');

const buildService = async (key: string = KEY): Promise<CryptoService> => {
  const values: Record<string, string> = { TOKEN_ENCRYPTION_KEY: key, TOKEN_ENCRYPTION_KEY_VERSION: '3' };
  const moduleRef = await Test.createTestingModule({
    providers: [
      CryptoService,
      {
        provide: ConfigService,
        useValue: {
          get: (name: string): string | undefined => values[name],
          getOrThrow: (name: string): string => {
            const value = values[name];
            if (value === undefined) {
              throw new Error(`missing ${name}`);
            }
            return value;
          },
        },
      },
    ],
  }).compile();

  return moduleRef.get(CryptoService);
};

describe('CryptoService', () => {
  it('descifra lo que cifro', async () => {
    const service = await buildService();
    const plaintext = '1//0ffake-refresh-token';

    const encrypted = service.encrypt(plaintext);

    expect(encrypted.ciphertext).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('usa un iv distinto por cifrado', async () => {
    const service = await buildService();

    const first = service.encrypt('token');
    const second = service.encrypt('token');

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('registra la version de clave para permitir rotacion', async () => {
    const service = await buildService();

    expect(service.encrypt('token').keyVersion).toBe(3);
  });

  it('falla si el ciphertext fue alterado', async () => {
    const service = await buildService();
    const encrypted = service.encrypt('token');
    const tampered = { ...encrypted, ciphertext: Buffer.from('otro-valor').toString('base64') };

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('falla si la clave no tiene 32 bytes', async () => {
    await expect(buildService(randomBytes(16).toString('base64'))).rejects.toThrow(/32 bytes/);
  });

  it('genera tokens aleatorios url-safe', async () => {
    const service = await buildService();

    const token = service.randomToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toBe(service.randomToken());
  });
});
