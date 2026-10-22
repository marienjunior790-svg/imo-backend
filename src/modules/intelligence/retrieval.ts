import type { MatchResult, MatchRetrievalMeta } from './types.js';

/** Max candidats scorés après présélection score-aware (fenêtre de ranking). */
export const MATCH_CANDIDATE_RECALL_LIMIT = 500;

/**
 * Taille d'un lot de la lecture ordonnée (loyer, date de publication, id).
 * Le parcours continue au-delà de ce lot. Ce n'est pas le plafond du catalogue.
 */
export const MATCH_SQL_FETCH_LIMIT = 10_000;

export function buildRetrievalMeta(input: {
  candidateCount: number;
  truncated: boolean;
  recallLimit?: number;
  eligibleTotal?: number;
  sqlFetchCount?: number;
  sqlMatchCount?: number;
  sqlFetchMode?: MatchRetrievalMeta['sqlFetchMode'];
  completeness?: MatchRetrievalMeta['completeness'];
  batches?: number;
}): MatchRetrievalMeta {
  return {
    strategy: 'hard_sql_score_preselect',
    candidateCount: input.candidateCount,
    truncated: input.truncated,
    recallLimit: input.recallLimit ?? MATCH_CANDIDATE_RECALL_LIMIT,
    ...(input.sqlFetchMode != null ? { sqlFetchMode: input.sqlFetchMode } : {}),
    ...(input.completeness != null ? { completeness: input.completeness } : {}),
    ...(input.batches != null ? { batches: input.batches } : {}),
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
