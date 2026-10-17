/** Métriques de ranking pour le banc d’essai Core Intelligence. */

export function dcgAtK(relevances: number[], k: number): number {
  let sum = 0;
  const n = Math.min(k, relevances.length);
  for (let i = 0; i < n; i++) {
    const rel = relevances[i] ?? 0;
    sum += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
  }
  return sum;
}

/** nDCG@k — relevances dans l’ordre du ranking produit ; ideal = tri décroissant des grades. */
export function ndcgAtK(relevancesInRankOrder: number[], k: number): number {
  const dcg = dcgAtK(relevancesInRankOrder, k);
  const ideal = [...relevancesInRankOrder].sort((a, b) => b - a);
  const idcg = dcgAtK(ideal, k);
  if (idcg === 0) return 0;
  return dcg / idcg;
}

export function precisionAtK(binaryHits: boolean[], k: number): number {
  const slice = binaryHits.slice(0, k);
  if (!slice.length) return 0;
  return slice.filter(Boolean).length / slice.length;
}

/** Grades de pertinence par id dans l’ordre du ranking. */
export function relevancesForRanking(rankedIds: string[], grades: Record<string, number>): number[] {
  return rankedIds.map((id) => grades[id] ?? 0);
}
