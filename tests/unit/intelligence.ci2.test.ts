import { dedupeRanked, listingFingerprint } from '../../src/modules/intelligence/dedupe';
import { runGoldB2Suite, goldSuitePassed } from '../../src/modules/intelligence/eval-harness';
import { goldB2Corpus, goldQualityCorpus } from '../../src/modules/intelligence/gold/b2-weighted';
import { runMatchEngine } from '../../src/modules/intelligence/matching.engine';
import { ndcgAtK, precisionAtK } from '../../src/modules/intelligence/metrics';
import { assessListingQuality } from '../../src/modules/intelligence/quality';
import { SCORER_VERSION } from '../../src/modules/intelligence/scorer-version';

describe('Core Intelligence CI-2 — gold B2 + nDCG', () => {
  it('scorerVersion 0.2.0', () => {
    expect(SCORER_VERSION).toBe('0.2.0');
  });

  it('calcule nDCG et precision', () => {
    expect(ndcgAtK([3, 2, 1], 10)).toBeGreaterThan(0.9);
    expect(precisionAtK([true, true, false], 3)).toBeCloseTo(2 / 3);
  });

  it('B2 gold suite : ordre stable + nDCG ≥ 0.85', () => {
    const results = runGoldB2Suite();
    for (const r of results) {
      expect(r.scorerVersion).toBe(SCORER_VERSION);
      expect(r.pass).toBe(true);
      expect(r.ndcg10).toBeGreaterThanOrEqual(0.85);
    }
    expect(goldSuitePassed(results)).toBe(true);
  });

  it('régression : top prix = moins chers d’abord', () => {
    const corpus = goldB2Corpus();
    const result = runMatchEngine(corpus, {
      maxRent: 200_000,
      minRooms: 2,
      cities: ['Brazzaville'],
      weights: { price: 0.75, location: 0.05, rooms: 0.1, quality: 0.05, surface: 0.05 },
    });
    const top3 = result.matches.slice(0, 3).map((m) => m.listing.id);
    expect(top3).toEqual(['g-mou-140', 'g-pot-160', 'g-bac-170']);
    expect(result.matches.every((m) => m.factors.length >= 1)).toBe(true);
  });
});

describe('Core Intelligence CI-3 — qualité B5 + dédup B6', () => {
  it('B5: contradiction pièces → flag + score inférieur', () => {
    const corpus = goldQualityCorpus();
    const result = runMatchEngine(corpus, { maxRent: 200_000, cities: ['Brazzaville'] });
    const good = result.matches.find((m) => m.listing.id === 'q-good');
    const bad = result.matches.find((m) => m.listing.id === 'q-contradict');
    expect(good).toBeDefined();
    expect(bad).toBeDefined();
    expect(assessListingQuality(bad!.listing).flags).toContain('ROOMS_CONTRADICTION');
    expect(bad!.listing.quality.flags).toContain('ROOMS_CONTRADICTION');
    expect(bad!.score).toBeLessThan(good!.score);
  });

  it('B6: doublons retirés (même empreinte)', () => {
    const corpus = goldQualityCorpus();
    const fpGood = listingFingerprint(corpus.find((c) => c.view.id === 'q-good')!);
    const fpDup = listingFingerprint(corpus.find((c) => c.view.id === 'q-dup')!);
    expect(fpGood).toBe(fpDup);

    const result = runMatchEngine(corpus, { maxRent: 200_000, cities: ['Brazzaville'] });
    const ids = result.matches.map((m) => m.listing.id);
    expect(ids).toContain('q-good');
    expect(ids).not.toContain('q-dup');

    const ranked = result.matches;
    const { removedIds } = dedupeRanked([
      ...ranked,
      { ...ranked[0]!, listing: { ...ranked[0]!.listing, id: 'extra-dup' } },
    ]);
    expect(removedIds).toContain('extra-dup');
  });
});
