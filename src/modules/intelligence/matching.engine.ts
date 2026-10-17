import { mergeDemandWithText } from './demand-interpreter.js';
import { dedupeRanked } from './dedupe.js';
import { filterEligible } from './eligibility.js';
import { normalizeDemand, type RawDemandInput } from './normalizer.js';
import { rankMatches } from './scorer.js';
import { SCORER_VERSION } from './scorer-version.js';
import type { ListingCandidate, MatchResult } from './types.js';

export type MatchEngineOptions = {
  limit?: number;
  defaults?: { currency?: string; locale?: string };
  /** Défaut true — B6 anti-doublons */
  dedupe?: boolean;
};

/**
 * Moteur pur (sans I/O) — banc d’essai et service s’appuient dessus.
 */
export function runMatchEngine(
  candidates: ListingCandidate[],
  raw: RawDemandInput,
  options?: MatchEngineOptions,
): MatchResult {
  const { demand: merged, interpretation } = mergeDemandWithText(raw);
  const demand = normalizeDemand(merged, options?.defaults);
  const gate = filterEligible(candidates, demand);

  const interpretationMeta = interpretation
    ? {
        interpreterVersion: interpretation.interpreterVersion,
        fieldsFromText: interpretation.fieldsFromText,
        clarifications: interpretation.clarifications,
        incomplete: interpretation.incomplete,
      }
    : undefined;

  if (!gate.ok) {
    return {
      demand,
      matches: [],
      eligibleCount: 0,
      scorerVersion: SCORER_VERSION,
      emptyReason: 'EMPTY_ELIGIBLE',
      suggestions: [
        ...(gate.suggestions ?? []),
        ...(interpretation?.clarifications ?? []),
      ].slice(0, 6),
      interpretation: interpretationMeta,
    };
  }

  let matches = rankMatches(gate.eligible, demand, options?.limit ?? 20);
  if (options?.dedupe !== false) {
    matches = dedupeRanked(matches).kept;
  }

  return {
    demand,
    matches,
    eligibleCount: gate.eligible.length,
    scorerVersion: SCORER_VERSION,
    interpretation: interpretationMeta,
    ...(demand.partial && interpretationMeta?.clarifications.length
      ? { suggestions: interpretationMeta.clarifications }
      : {}),
  };
}
