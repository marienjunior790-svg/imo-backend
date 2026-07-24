import { randomBytes } from 'crypto';

const LOGIN_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1

/**
 * D1 — Format global : ITC-{8 alphanumériques}
 * Ex. ITC-8F4K92AZ — pas de préfixe org (pas de fuite tenant, portable).
 */
export function generateLoginId(): string {
  const bytes = randomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += LOGIN_ID_ALPHABET[bytes[i]! % LOGIN_ID_ALPHABET.length];
  }
  return `ITC-${suffix}`;
}

/**
 * D2 — Mot de passe temporaire : ≥16 chars, maj/min/chiffre/symbole via crypto.randomBytes.
 * Pas d'UUID, pas de timestamp, pas de génération humaine.
 */
export function generateTemporaryPassword(length = 20): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*+-=?';
  const all = upper + lower + digits + symbols;

  const pick = (alphabet: string) => alphabet[randomBytes(1)[0]! % alphabet.length]!;

  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest: string[] = [];
  const n = Math.max(length, 16) - required.length;
  for (let i = 0; i < n; i++) {
    rest.push(pick(all));
  }

  const chars = [...required, ...rest];
  // Fisher–Yates avec entropy crypto
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
