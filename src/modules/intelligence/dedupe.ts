import type { ListingCandidate, RankedMatch } from './types.js';

/** Empreinte simple anti-doublon (adresse + surface + loyer + devise). */
export function listingFingerprint(c: ListingCandidate | RankedMatch['listing']): string {
  const v = 'view' in c ? c.view : c;
  const addr = (v.building?.address ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const city = (v.building?.city ?? '').trim().toLowerCase();
  const surface = v.surface ?? '';
  return `${city}|${addr}|${surface}|${v.rentAmount}|${v.currency.toUpperCase()}`;
}

/**
 * Conserve le meilleur score par empreinte (premier dans une liste déjà triée).
 */
export function dedupeRanked(matches: RankedMatch[]): { kept: RankedMatch[]; removedIds: string[] } {
  const seen = new Set<string>();
  const kept: RankedMatch[] = [];
  const removedIds: string[] = [];
  for (const m of matches) {
    const fp = listingFingerprint(m.listing);
    if (seen.has(fp)) {
      removedIds.push(m.listing.id);
      continue;
    }
    seen.add(fp);
    kept.push(m);
  }
  return { kept, removedIds };
}
