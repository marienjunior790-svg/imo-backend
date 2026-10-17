import type { DemandSpec, ListingCandidate } from './types.js';
import { MATCH_SQL_FETCH_LIMIT } from './retrieval.js';

/** Mode SQL effectif pour un appel match. */
export type SqlFetchMode = 'rent_asc' | 'progressive';

/**
 * Politique env :
 * - adaptive (défaut) : rent_asc si pool ≤ limit, sinon progressive (0E.2)
 * - rent_asc : toujours A (repli)
 * - progressive : C dès que pool > limit, sinon A
 */
export type SqlFetchPolicy = 'adaptive' | 'rent_asc' | 'progressive';

export function resolveSqlFetchMode(
  sqlMatchCount: number,
  policy: SqlFetchPolicy,
  fetchLimit = MATCH_SQL_FETCH_LIMIT,
): SqlFetchMode {
  if (policy === 'rent_asc') return 'rent_asc';
  if (sqlMatchCount <= fetchLimit) return 'rent_asc';
  if (policy === 'progressive' || policy === 'adaptive') return 'progressive';
  return 'rent_asc';
}

/** Target loyer pour le lot « milieu » (aligné prototype 0E.1 C). */
export function progressivePriceTarget(demand: DemandSpec): number | null {
  if (demand.minRent != null && demand.maxRent != null) {
    return (demand.minRent + demand.maxRent) / 2;
  }
  if (demand.maxRent != null) {
    return demand.maxRent * 0.35;
  }
  return null;
}

export function progressivePerRound(limit = MATCH_SQL_FETCH_LIMIT, rounds = 3): number {
  return Math.ceil(limit / rounds);
}

/**
 * Fusionne des lots (bas / milieu / haut) sans doublon, budget global `limit`.
 * Ne multiplie pas le budget par le nombre de lots.
 */
export function mergeProgressiveRounds(
  rounds: ListingCandidate[][],
  limit = MATCH_SQL_FETCH_LIMIT,
): { merged: ListingCandidate[]; roundSizes: number[]; rowsRead: number } {
  const picked: ListingCandidate[] = [];
  const have = new Set<string>();
  const roundSizes: number[] = [];

  for (const batch of rounds) {
    if (picked.length >= limit) {
      roundSizes.push(0);
      continue;
    }
    let added = 0;
    for (const c of batch) {
      if (picked.length >= limit) break;
      if (have.has(c.view.id)) continue;
      have.add(c.view.id);
      picked.push(c);
      added++;
    }
    roundSizes.push(added);
  }

  return { merged: picked, roundSizes, rowsRead: picked.length };
}

/** Sélection déterministe des n plus proches du target (tie-break id). */
export function pickClosestToTarget(
  candidates: ListingCandidate[],
  target: number,
  n: number,
  excludeIds?: Set<string>,
): ListingCandidate[] {
  const excl = excludeIds ?? new Set<string>();
  const scored = candidates
    .filter((c) => !excl.has(c.view.id) && c.view.rentAmount > 0)
    .map((c) => ({
      c,
      d: Math.abs(c.view.rentAmount - target),
    }));
  scored.sort((a, b) => a.d - b.d || a.c.view.id.localeCompare(b.c.view.id));
  return scored.slice(0, n).map((x) => x.c);
}

/** Demi-fenêtre de loyer pour sur-échantillonner le lot milieu en SQL. */
export function progressiveMidWindow(demand: DemandSpec, target: number): { gte: number; lte: number } {
  if (demand.minRent != null && demand.maxRent != null) {
    const span = Math.max(demand.maxRent - demand.minRent, 1);
    const half = Math.max(span * 0.35, 5_000);
    return {
      gte: Math.max(demand.minRent, target - half),
      lte: Math.min(demand.maxRent, target + half),
    };
  }
  if (demand.maxRent != null) {
    const half = Math.max(target * 0.5, 5_000);
    return { gte: Math.max(0, target - half), lte: Math.min(demand.maxRent, target + half) };
  }
  const half = Math.max(target * 0.35, 10_000);
  return { gte: Math.max(0, target - half), lte: target + half };
}
