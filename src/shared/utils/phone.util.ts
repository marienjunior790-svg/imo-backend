/**
 * Normalise un numéro vers E.164.
 * Pays par défaut : Congo-Brazzaville (242).
 * Ne jamais inventer un numéro — retourne null si ambigu / invalide.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultCountryCode = '242',
): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Garder un éventuel + initial, retirer espaces / tirets / parenthèses
  s = s.replace(/[\s.\-()]/g, '');
  if (!s) return null;

  const cc = defaultCountryCode.replace(/^\+/, '').replace(/\D/g, '');
  if (!cc) return null;

  if (s.startsWith('00')) {
    s = `+${s.slice(2)}`;
  }

  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    if (!digits || digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = s.replace(/\D/g, '');
  if (!digits) return null;

  // Déjà préfixé du code pays (ex. 24206… ou 2426…)
  if (digits.startsWith(cc) && digits.length >= cc.length + 7) {
    return `+${digits}`;
  }

  // Mobile local type 06… / 05… → +2426… / +2425… (drop leading 0)
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    return `+${cc}${digits.slice(1)}`;
  }

  // Numéro national sans 0 (ex. 06XXXXXXXX déjà sans 0 → 6XXXXXXXX)
  if (digits.length >= 8 && digits.length <= 9 && !digits.startsWith(cc)) {
    return `+${cc}${digits}`;
  }

  return null;
}

/** E.164 strict pour WhatsApp Cloud API (8–15 digits après +). */
export function isValidWhatsAppPhone(e164: string | null | undefined): boolean {
  if (!e164) return false;
  return /^\+[1-9]\d{7,14}$/.test(e164);
}
