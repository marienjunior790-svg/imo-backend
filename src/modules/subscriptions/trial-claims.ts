import { createHash } from 'crypto';
import { normalizePhoneE164 } from '../../shared/utils/phone.util.js';

const DOTLESS_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * E-mail ramené à sa boîte réelle : minuscules, sans alias « +… », sans points pour Gmail.
 * Sert uniquement à reconnaître un essai déjà consommé ; l'adresse de connexion n'est pas modifiée.
 */
export function normalizeEmailForTrial(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  local = local.split('+')[0];
  if (DOTLESS_DOMAINS.has(domain)) local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export interface TrialClaimKey {
  kind: 'EMAIL' | 'PHONE';
  valueHash: string;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Congo : « +242 06… » et « 06… » désignent la même ligne, avec ou sans le 0 après l'indicatif. */
export function normalizePhoneForTrial(phone?: string | null): string | null {
  const e164 = normalizePhoneE164(phone);
  return e164 ? e164.replace(/^\+2420/, '+242') : null;
}

/** Clés d'essai (empreintes, jamais la valeur en clair) pour un e-mail et un téléphone. */
export function trialClaimKeys(email: string, phone?: string | null): TrialClaimKey[] {
  const keys: TrialClaimKey[] = [{ kind: 'EMAIL', valueHash: hash(normalizeEmailForTrial(email)) }];
  const normalized = normalizePhoneForTrial(phone);
  if (normalized) keys.push({ kind: 'PHONE', valueHash: hash(normalized) });
  return keys;
}
