import { isValidWhatsAppPhone, normalizePhoneE164 } from '../../src/shared/utils/phone.util.js';

describe('normalizePhoneE164', () => {
  it('normalise un mobile CG 06… vers +2426…', () => {
    expect(normalizePhoneE164('06 123 45 67')).toBe('+24261234567');
    expect(normalizePhoneE164('061234567')).toBe('+24261234567');
  });

  it('conserve un E.164 déjà valide', () => {
    expect(normalizePhoneE164('+242061234567')).toBe('+242061234567');
    expect(normalizePhoneE164('+33612345678')).toBe('+33612345678');
  });

  it('ajoute + si préfixe 242 sans plus', () => {
    expect(normalizePhoneE164('242061234567')).toBe('+242061234567');
  });

  it('gère le préfixe 00', () => {
    expect(normalizePhoneE164('00242061234567')).toBe('+242061234567');
  });

  it('retourne null si vide ou inventable', () => {
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164('abc')).toBeNull();
    expect(normalizePhoneE164('12')).toBeNull();
  });
});

describe('isValidWhatsAppPhone', () => {
  it('accepte E.164 strict', () => {
    expect(isValidWhatsAppPhone('+24261234567')).toBe(true);
    expect(isValidWhatsAppPhone('+33612345678')).toBe(true);
  });

  it('refuse formats invalides', () => {
    expect(isValidWhatsAppPhone('061234567')).toBe(false);
    expect(isValidWhatsAppPhone('+0123')).toBe(false);
    expect(isValidWhatsAppPhone(null)).toBe(false);
    expect(isValidWhatsAppPhone('')).toBe(false);
  });
});
