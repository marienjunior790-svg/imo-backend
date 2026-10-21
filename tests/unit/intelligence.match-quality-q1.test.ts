/**
 * GO-MATCH-QUALITY-1 — baseline du scorer 0.2.0 sur le jeu de référence.
 * Lecture seule : un écart figé ici est un constat, pas une autorisation de changer le moteur.
 */
import { measureQualityQ1, type QualityCaseMeasure } from '../../src/modules/intelligence/quality-eval.js';
import { SCORER_VERSION } from '../../src/modules/intelligence/scorer-version.js';

function byId(rows: QualityCaseMeasure[], id: string): QualityCaseMeasure {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`cas absent: ${id}`);
  return row;
}

describe('GO-MATCH-QUALITY-1 — baseline scorer 0.2.0', () => {
  const suite = measureQualityQ1();

  it('rejoue la même mesure', () => {
    expect(measureQualityQ1()).toEqual(suite);
    expect(suite.map((r) => r.scorerVersion)).toEqual([
      SCORER_VERSION,
      SCORER_VERSION,
      SCORER_VERSION,
    ]);
  });

  it('ne propose aucun bien interdit par un critère explicite', () => {
    for (const row of suite) {
      expect(row.hardFalsePositiveIds).toEqual([]);
    }
  });

  it('Q1-budget-rooms-city — tête de liste et rappel complets', () => {
    const row = byId(suite, 'Q1-budget-rooms-city');
    expect(row.rankedIds).toEqual(['q-ideal-180', 'q-mid-250', 'q-pot-270', 'q-room-280']);
    expect(row.scores.map((s) => s.score)).toEqual([70, 62, 60, 60]);
    expect(row.rankedIds).not.toContain('q-mid-dup');
    expect(row.eligibleCount).toBe(5);
    expect(row.missingRelevantIds).toEqual([]);
    expect(row.softFalsePositiveIds).toEqual([]);
    expect(row.recallRelevant).toBe(1);
    expect(row.precisionAt1).toBe(1);
    expect(row.precisionAt3).toBe(1);
    expect(row.ndcgAt10).toBe(1);
    expect(row.firstIsBest).toBe(true);
  });

  it('Q1-district-preference — Moungali pertinent manquant à cause du filtre dur', () => {
    const row = byId(suite, 'Q1-district-preference');
    expect(row.rankedIds).toEqual(['q-ideal-180', 'q-pot-270']);
    expect(row.missingRelevantIds).toEqual(['q-mid-250']);
    expect(row.missingBecauseHard).toEqual(['q-mid-250']);
    expect(row.missingDespiteEligible).toEqual([]);
    expect(row.recallRelevant).toBe(0.6667);
    expect(row.precisionAt1).toBe(1);
    expect(row.precisionAt3).toBe(1);
    expect(row.firstId).toBe('q-ideal-180');
    expect(row.firstIsBest).toBe(true);
    expect(row.ndcgAt10).toBe(1);
  });

  it('Q1-incomplete-vs-complete — le bien contradictoire passe, hors du top 3', () => {
    const row = byId(suite, 'Q1-incomplete-vs-complete');
    expect(row.rankedIds).toEqual(['q-rooms-2', 'q-ideal-180', 'q-fair-170', 'q-cheap-bad']);
    expect(row.scores.map((s) => s.score)).toEqual([70, 62, 61, 41]);
    expect(row.softFalsePositiveIds).toEqual(['q-cheap-bad']);
    expect(row.softFalsePositiveTop3).toEqual([]);
    expect(row.missingRelevantIds).toEqual([]);
    expect(row.precisionAt1).toBe(1);
    expect(row.precisionAt3).toBe(1);
    expect(row.firstIsBest).toBe(true);
    expect(row.ndcgAt10).toBe(1);
  });
});
