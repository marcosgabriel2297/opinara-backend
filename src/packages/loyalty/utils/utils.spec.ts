import { CARD_TOKEN_PATTERN, MEMBER_CODE_PATTERN, generateCardToken, generateMemberCode, hashCardToken } from './codes';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['11 2345-6789', '+5491123456789'],
    ['1123456789', '+5491123456789'],
    ['011 15 2345 6789', '+5491123456789'],
    ['11 15 2345 6789', '+5491123456789'],
    ['+54 9 11 2345 6789', '+5491123456789'],
    ['+54 11 2345 6789', '+5491123456789'],
    ['5491123456789', '+5491123456789'],
    ['(0221) 15 555-1234', '+5492215551234'],
    ['221 555 1234', '+5492215551234'],
    ['2954 15 55 1234', '+5492954551234'],
    ['0351 155 123456', '+5493515123456'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('acepta numeros de otros paises con +', () => {
    expect(normalizePhone('+598 99 123 456')).toBe('+59899123456');
  });

  it.each(['', 'hola', '1234', '15 2345 6789', '4123456789', '+1 2', '11 2345 6789 1234'])('rechaza %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('codigos de la tarjeta', () => {
  it('el codigo de la caja no tiene caracteres ambiguos', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateMemberCode();
      expect(code).toMatch(MEMBER_CODE_PATTERN);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('el token es aleatorio y se guarda solo su hash', () => {
    const token = generateCardToken();

    expect(token).toMatch(CARD_TOKEN_PATTERN);
    expect(generateCardToken()).not.toBe(token);
    expect(hashCardToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCardToken(token)).not.toContain(token);
  });
});
