import type { MatchResult, MatchRetrievalMeta } from './types.js';

/** Max candidats scorés après présélection score-aware (fenêtre de ranking). */
export const MATCH_CANDIDATE_RECALL_LIMIT = 500;

/**
 * Max lignes chargées depuis SQL après hard filters.
 * Au-delà → truncated (rappel non exhaustif côté base).
 * Dimensionné pour catalogues régionaux ; pas un « simple bump » du take aveugle.
 */
export const MATCH_SQL_FETCH_LIMIT = 10_000;

export function buildRetrievalMeta(input: {
  candidateCount: number;
  truncated: boolean;
  recallLimit?: number;
  eligibleTotal?: number;
  sqlFetchCount?: number;
  sqlMatchCount?: number;
}): MatchRetrievalMeta {
  return {
    strategy: 'hard_sql_score_preselect',
    candidateCount: input.candidateCount,
    truncated: input.truncated,
    recallLimit: input.recallLimit ?? MATCH_CANDIDATE_RECALL_LIMIT,
    ...(input.eligibleTotal != null ? { eligibleTotal: input.eligibleTotal } : {}),
    ...(input.sqlFetchCount != null ? { sqlFetchCount: input.sqlFetchCount } : {}),
    ...(input.sqlMatchCount != null ? { sqlMatchCount: input.sqlMatchCount } : {}),
  };
}

export function withRetrievalMeta(result: MatchResult, meta: MatchRetrievalMeta): MatchResult {
  return {
    ...result,
    retrieval: meta,
  };
}
