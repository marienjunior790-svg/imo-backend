import type { MatchResult, MatchRetrievalMeta } from './types.js';

/** Cap de rappel Prisma actuel — documenté Phase 0B ; ne pas lever sans protocole N>500. */
export const MATCH_CANDIDATE_RECALL_LIMIT = 500;

export function buildRetrievalMeta(candidateCount: number, recallLimit = MATCH_CANDIDATE_RECALL_LIMIT): MatchRetrievalMeta {
  return {
    strategy: 'published_at_desc_take',
    candidateCount,
    truncated: candidateCount >= recallLimit,
    recallLimit,
  };
}

export function withRetrievalMeta(
  result: MatchResult,
  candidateCount: number,
  recallLimit = MATCH_CANDIDATE_RECALL_LIMIT,
): MatchResult {
  return {
    ...result,
    retrieval: buildRetrievalMeta(candidateCount, recallLimit),
  };
}
