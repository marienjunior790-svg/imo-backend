import { toListingView } from '../../src/modules/intelligence/listing-view';
import { MATCH_SQL_FETCH_LIMIT, buildRetrievalMeta } from '../../src/modules/intelligence/retrieval';
import {
  mergeProgressiveRounds,
  pickClosestToTarget,
  progressiveMidWindow,
  progressivePerRound,
  progressivePriceTarget,
  resolveSqlFetchMode,
} from '../../src/modules/intelligence/sql-fetch';
import { normalizeDemand } from '../../src/modules/intelligence/normalizer';
import type { ListingCandidate } from '../../src/modules/intelligence/types';

function cand(id: string, rent: number): ListingCandidate {
  const view = toListingView({
    id,
    label: id,
    description: 'x',
    rooms: 2,
    surface: 50,
    floor: 1,
    rentAmount: rent,
    currency: 'XAF',
    status: 'AVAILABLE',
    isPublished: true,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    amenities: null,
    building: {
      name: 'B',
      address: 'a',
      district: 'Poto-Poto',
      city: 'Brazzaville',
      latitude: null,
      longitude: null,
    },
    organization: {
      id: 'o',
      name: 'O',
      type: 'AGENCY',
      isActive: true,
      isValidated: true,
    },
    documents: [],
  });
  return { view, isPublished: true, orgActive: true, orgValidated: true };
}

describe('Phase 0E.2 intégration — sql-fetch', () => {
  it('adaptive : rent_asc sous la limite, progressive au-delà', () => {
    expect(resolveSqlFetchMode(10000, 'adaptive')).toBe('rent_asc');
    expect(resolveSqlFetchMode(10001, 'adaptive')).toBe('progressive');
    expect(resolveSqlFetchMode(50000, 'rent_asc')).toBe('rent_asc');
    expect(resolveSqlFetchMode(500, 'progressive')).toBe('rent_asc');
    expect(resolveSqlFetchMode(20000, 'progressive')).toBe('progressive');
  });

  it('mergeProgressiveRounds respecte le budget global (pas × rounds)', () => {
    const low = Array.from({ length: 4000 }, (_, i) => cand(`l-${i}`, 100_000 + i));
    const mid = Array.from({ length: 4000 }, (_, i) => cand(`m-${i}`, 150_000 + i));
    const high = Array.from({ length: 4000 }, (_, i) => cand(`h-${i}`, 200_000 - i));
    const { merged, rowsRead, roundSizes } = mergeProgressiveRounds(
      [low, mid, high],
      MATCH_SQL_FETCH_LIMIT,
    );
    expect(rowsRead).toBe(MATCH_SQL_FETCH_LIMIT);
    expect(merged).toHaveLength(MATCH_SQL_FETCH_LIMIT);
    expect(roundSizes.reduce((a, b) => a + b, 0)).toBe(MATCH_SQL_FETCH_LIMIT);
    expect(new Set(merged.map((c) => c.view.id)).size).toBe(merged.length);
  });

  it('pickClosestToTarget déterministe', () => {
    const pool = [cand('c', 170_000), cand('a', 160_000), cand('b', 160_500)];
    const a = pickClosestToTarget(pool, 160_000, 2);
    const b = pickClosestToTarget(pool, 160_000, 2);
    expect(a.map((c) => c.view.id)).toEqual(b.map((c) => c.view.id));
    expect(a[0]!.view.id).toBe('a');
  });

  it('progressivePriceTarget / midWindow fourchette min-max', () => {
    const demand = normalizeDemand({
      minRent: 140_000,
      maxRent: 180_000,
      currency: 'XAF',
    });
    const t = progressivePriceTarget(demand);
    expect(t).toBe(160_000);
    const w = progressiveMidWindow(demand, t!);
    expect(w.gte).toBeLessThanOrEqual(160_000);
    expect(w.lte).toBeGreaterThanOrEqual(160_000);
    expect(progressivePerRound(10_000, 3)).toBe(3334);
  });

  it('buildRetrievalMeta expose sqlFetchMode', () => {
    const meta = buildRetrievalMeta({
      candidateCount: 500,
      truncated: true,
      sqlFetchMode: 'progressive',
      sqlMatchCount: 12000,
      sqlFetchCount: 10000,
      eligibleTotal: 10000,
    });
    expect(meta.sqlFetchMode).toBe('progressive');
    expect(meta.strategy).toBe('hard_sql_score_preselect');
  });
});
