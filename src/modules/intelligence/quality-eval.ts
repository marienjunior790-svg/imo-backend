import { filterEligible } from './eligibility.js';
import { qualityQ1Corpus, qualityQ1Queries, type QualityQuery } from './gold/quality-q1.js';
import { runMatchEngine } from './matching.engine.js';
import { ndcgAtK, precisionAtK, relevancesForRanking } from './metrics.js';
import type { ListingCandidate } from './types.js';

export type QualityCaseMeasure = {
  id: string;
  criterion: string;
  scorerVersion: string;
  rankedIds: string[];
  scores: Array<{ id: string; score: number }>;
  /** Biens proposés alors qu’un critère explicite les interdit. */
  hardFalsePositiveIds: string[];
  /** Biens proposés, éligibles au filtre, mais jugés non pertinents (grade 0). */
  softFalsePositiveIds: string[];
  /** Biens grade 0 dans les 3 premiers. */
  softFalsePositiveTop3: string[];
  /** grade >= relevantMinGrade absents de la liste. */
  missingRelevantIds: string[];
  /** Absents parce que le filtre dur les a exclus (écart référence / moteur). */
  missingBecauseHard: string[];
  /** Absents alors qu’ils étaient éligibles (dédoublonnage ou plafond). */
  missingDespiteEligible: string[];
  recallRelevant: number;
  precisionAt1: number;
  precisionAt3: number;
  /** nDCG@10 des biens retournés, manquants pertinents ajoutés en fin de liste. */
  ndcgAt10: number;
  firstId: string | null;
  firstIsBest: boolean;
  eligibleCount: number;
};

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function measureQualityCase(
  corpus: ListingCandidate[],
  query: QualityQuery,
): QualityCaseMeasure {
  const result = runMatchEngine(corpus, query.demand);
  const rankedIds = result.matches.map((m) => m.listing.id);
  const byId = new Map(query.judgments.map((j) => [j.id, j]));
  const grades: Record<string, number> = {};
  for (const j of query.judgments) grades[j.id] = j.grade;

  const hardFalsePositiveIds = rankedIds.filter((id) => byId.get(id)?.exclude);
  const softFalsePositiveIds = rankedIds.filter((id) => {
    const j = byId.get(id);
    return !!j && !j.exclude && j.grade === 0;
  });

  const relevantIds = query.judgments
    .filter((j) => !j.exclude && j.grade >= query.relevantMinGrade)
    .map((j) => j.id);
  const missingRelevantIds = relevantIds.filter((id) => !rankedIds.includes(id));

  const gate = filterEligible(corpus, result.demand);
  const eligibleIds = new Set(gate.ok ? gate.eligible.map((c) => c.view.id) : []);
  const missingBecauseHard = missingRelevantIds.filter((id) => !eligibleIds.has(id));
  const missingDespiteEligible = missingRelevantIds.filter((id) => eligibleIds.has(id));

  const returnedRel = relevancesForRanking(rankedIds, grades);
  const missingRel = missingRelevantIds.map((id) => grades[id] ?? 0);
  const bestGrade = query.judgments.reduce((max, j) => (j.exclude ? max : Math.max(max, j.grade)), 0);
  const firstId = rankedIds[0] ?? null;
  const firstGrade = firstId ? (grades[firstId] ?? 0) : 0;
  const found = relevantIds.length - missingRelevantIds.length;

  return {
    id: query.id,
    criterion: query.criterion,
    scorerVersion: result.scorerVersion,
    rankedIds,
    scores: result.matches.map((m) => ({ id: m.listing.id, score: m.score })),
    hardFalsePositiveIds,
    softFalsePositiveIds,
    softFalsePositiveTop3: softFalsePositiveIds.filter((id) => rankedIds.indexOf(id) < 3),
    missingRelevantIds,
    missingBecauseHard,
    missingDespiteEligible,
    recallRelevant: relevantIds.length === 0 ? 1 : round4(found / relevantIds.length),
    precisionAt1: precisionAtK([firstGrade >= query.relevantMinGrade], 1),
    precisionAt3: precisionAtK(
      rankedIds.slice(0, 3).map((id) => (grades[id] ?? 0) >= query.relevantMinGrade),
      3,
    ),
    ndcgAt10: round4(ndcgAtK([...returnedRel, ...missingRel], 10)),
    firstId,
    firstIsBest: firstId != null && firstGrade === bestGrade && bestGrade > 0,
    eligibleCount: result.eligibleCount,
  };
}

export function measureQualityQ1(corpus = qualityQ1Corpus()): QualityCaseMeasure[] {
  return qualityQ1Queries().map((q) => measureQualityCase(corpus, q));
}
