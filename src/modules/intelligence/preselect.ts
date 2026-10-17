import { rankMatches } from './scorer.js';
import type { DemandSpec, ListingCandidate } from './types.js';

export type PreselectResult = {
  selected: ListingCandidate[];
  /** true si le pool éligible dépassait recallLimit — présélection par score du scorer existant */
  truncated: boolean;
  eligibleTotal: number;
};

/**
 * Présélection score-aware : utilise rankMatches (scorer 0.2.0) pour garder les
 * recallLimit meilleurs, au lieu de publishedAt. Déterministe (tie-break id).
 */
export function preselectByScore(
  eligible: ListingCandidate[],
  demand: DemandSpec,
  recallLimit: number,
): PreselectResult {
  const eligibleTotal = eligible.length;
  if (eligibleTotal <= recallLimit) {
    return { selected: eligible, truncated: false, eligibleTotal };
  }

  const ranked = rankMatches(eligible, demand, recallLimit);
  const byId = new Map(eligible.map((c) => [c.view.id, c]));
  const selected: ListingCandidate[] = [];
  for (const m of ranked) {
    const c = byId.get(m.listing.id);
    if (c) selected.push(c);
  }

  return { selected, truncated: true, eligibleTotal };
}
