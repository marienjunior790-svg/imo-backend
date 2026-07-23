import {
  buildOtpAuthUri,
  generateTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
} from '../../src/shared/auth/totp.js';
import { createHmac } from 'crypto';

describe('TOTP (P4)', () => {
  it('génère un secret base32 et un URI otpauth', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    const uri = buildOtpAuthUri({ secret, email: 'admin@itc.cg' });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(secret);
  });

  it('vérifie un code valide pour le compteur courant', () => {
    const secret = generateTotpSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    // recalcule HOTP comme dans l'impl (test d'intégration légère via verify)
    // On génère le code attendu en dupliquant la logique minimale
    const code = (() => {
      const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      const cleaned = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
      let bits = 0;
      let value = 0;
      const out: number[] = [];
      for (const ch of cleaned) {
        const idx = BASE32.indexOf(ch);
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
          out.push((value >>> (bits - 8)) & 0xff);
          bits -= 8;
        }
      }
      const key = Buffer.from(out);
      const buf = Buffer.alloc(8);
      let c = counter;
      for (let i = 7; i >= 0; i--) {
        buf[i] = c & 0xff;
        c = Math.floor(c / 256);
      }
      const hmac = createHmac('sha1', key).update(buf).digest();
      const offset = hmac[hmac.length - 1]! & 0x0f;
      const bin =
        ((hmac[offset]! & 0x7f) << 24) |
        ((hmac[offset + 1]! & 0xff) << 16) |
        ((hmac[offset + 2]! & 0xff) << 8) |
        (hmac[offset + 3]! & 0xff);
      return String(bin % 1_000_000).padStart(6, '0');
    })();

    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('génère des codes de récupération uniques', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
  });
});
