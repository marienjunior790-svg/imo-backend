/**
 * CUID extraction — prefer labeled ids (leaseId / paymentId / ...) before bare cuid.
 * Never invents an id.
 */

const CUID_RE = /\b(c[a-z0-9]{20,})\b/i;

export type CuidLabelPrefer = 'leaseId' | 'paymentId' | 'tenantId' | 'apartmentId';

const LABEL_PATTERNS: Record<CuidLabelPrefer, RegExp> = {
  leaseId: /(?:leaseId|bailId|contratId)\s*[:=]?\s*(c[a-z0-9]{20,})/i,
  paymentId: /(?:paymentId|paiementId)\s*[:=]?\s*(c[a-z0-9]{20,})/i,
  tenantId: /(?:tenantId|locataireId)\s*[:=]?\s*(c[a-z0-9]{20,})/i,
  apartmentId: /(?:apartmentId|logementId|appartId)\s*[:=]?\s*(c[a-z0-9]{20,})/i,
};

const ALL_LABEL_ORDER: CuidLabelPrefer[] = ['leaseId', 'paymentId', 'tenantId', 'apartmentId'];

/**
 * Prefers an explicitly labeled id when present; otherwise first bare cuid.
 * If `prefer` is set, that label is checked first, then other labels, then bare.
 */
export function extractCuidPreferLabeled(
  text: string,
  prefer?: CuidLabelPrefer,
): string | undefined {
  if (!text) return undefined;

  const order = prefer
    ? [prefer, ...ALL_LABEL_ORDER.filter((k) => k !== prefer)]
    : ALL_LABEL_ORDER;

  for (const key of order) {
    const m = text.match(LABEL_PATTERNS[key]);
    if (m?.[1]) return m[1];
  }

  const bare = text.match(CUID_RE);
  return bare?.[1];
}

/** Bare cuid only. Prefer extractCuidPreferLabeled when labels may appear. */
export function extractBareCuid(text: string): string | undefined {
  const m = text.match(CUID_RE);
  return m?.[1];
}
