import { redact, redactToString } from './redact.util';

describe('redact', () => {
  it('oculta tokens y secretos en cualquier nivel', () => {
    const payload = {
      access_token: 'ya29.super-secret',
      nested: { refresh_token: '1//0secret', safe: 'visible' },
      list: [{ client_secret: 'abc' }],
    };

    expect(redact(payload)).toEqual({
      access_token: '[REDACTED]',
      nested: { refresh_token: '[REDACTED]', safe: 'visible' },
      list: [{ client_secret: '[REDACTED]' }],
    });
  });

  it('no oculta los cursores de paginacion, que no son secretos', () => {
    expect(redact({ pageToken: 'CAES', nextPageToken: 'CBES', pageSize: 50 })).toEqual({
      pageToken: 'CAES',
      nextPageToken: 'CBES',
      pageSize: 50,
    });
  });

  it('no rompe con valores primitivos ni ciclos profundos', () => {
    expect(redact('texto')).toBe('texto');
    expect(redact(null)).toBeNull();
    expect(redactToString({ password: 'x' })).toBe('{"password":"[REDACTED]"}');
  });
});
