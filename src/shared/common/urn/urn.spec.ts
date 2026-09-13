import { Urn } from './index';

describe('Urn', () => {
  it('genera y parsea un urn con entidad e id', () => {
    const urn = Urn.createUUID('business');

    expect(urn).toMatch(/^urn:business:[0-9a-f-]{36}$/);
    expect(Urn.entity(urn)).toBe('business');
    expect(Urn.id(urn)).toHaveLength(36);
  });

  it('valida el formato y la entidad esperada', () => {
    const urn = Urn.createUUID('review');

    expect(Urn.isValid(urn)).toBe(true);
    expect(Urn.isValid(urn, 'review')).toBe(true);
    expect(Urn.isValid(urn, 'business')).toBe(false);
    expect(Urn.isValid('review:123')).toBe(false);
    expect(Urn.isValid('urn:review')).toBe(false);
    expect(Urn.isValid('')).toBe(false);
  });
});
