import { filterEligible } from '../../src/modules/intelligence/eligibility';
import { buildHardApartmentWhere } from '../../src/modules/intelligence/hard-where';
import { toListingView } from '../../src/modules/intelligence/listing-view';
import { runMatchEngine } from '../../src/modules/intelligence/matching.engine';
import { mergeDemandWithText } from '../../src/modules/intelligence/demand-interpreter';
import { normalizeDemand } from '../../src/modules/intelligence/normalizer';
import { preselectByScore } from '../../src/modules/intelligence/preselect';
import {
  MATCH_CANDIDATE_RECALL_LIMIT,
  buildRetrievalMeta,
  withRetrievalMeta,
} from '../../src/modules/intelligence/retrieval';
import { ndcgAtK, precisionAtK, relevancesForRanking } from '../../src/modules/intelligence/metrics';
import { assertNoPrivateLeak } from '../../src/modules/intelligence/listing-view';
import type { RawDemandInput } from '../../src/modules/intelligence/normalizer';
import type { ListingCandidate } from '../../src/modules/intelligence/types';

const DEMAND = {
  maxRent: 180_000,
  minRooms: 2,
  cities: ['Brazzaville'],
  districts: ['Poto-Poto'],
  currency: 'XAF' as const,
};

function candidate(
  i: number,
  opts: {
    id?: string;
    rent?: number;
    rooms?: number | null;
    district?: string;
    city?: string;
    status?: string;
    published?: boolean;
    currency?: string;
    publishedAt?: Date;
    address?: string;
    description?: string | null;
  } = {},
): ListingCandidate {
  const publishedAt = opts.publishedAt ?? new Date(Date.UTC(2026, 9, 17, 12, 0, 0) - i * 60_000);
  const id = opts.id ?? `gen-${i}`;
  const view = toListingView({
    id,
    label: `Appt ${id}`,
    description: opts.description ?? `Logement synthétique ${id}`,
    rooms: opts.rooms ?? 2,
    surface: 50,
    floor: 1,
    rentAmount: opts.rent ?? 150_000,
    currency: opts.currency ?? 'XAF',
    status: opts.status ?? 'AVAILABLE',
    isPublished: opts.published ?? true,
    publishedAt,
    amenities: '["clim"]',
    building: {
      name: 'Immeuble Synth',
      address: opts.address ?? `${1000 + i} rue Synth`,
      district: opts.district ?? 'Poto-Poto',
      city: opts.city ?? 'Brazzaville',
      latitude: null,
      longitude: null,
    },
    organization: {
      id: 'org-synth',
      name: 'Org Synth',
      type: 'AGENCY',
      isActive: true,
      isValidated: true,
    },
    documents: [{ cloudinaryUrl: `https://cdn.example/${id}.jpg`, type: 'APARTMENT_PHOTO' }],
  });
  return {
    view,
    isPublished: opts.published ?? true,
    orgActive: true,
    orgValidated: true,
    _publishedAtMs: publishedAt.getTime(),
  } as ListingCandidate & { _publishedAtMs: number };
}

/** Corpus adversatif Phase 0C/0D : bruit récent hors critères + needles anciens parfaits. */
function buildAdversarialCorpus(noiseRecent: number) {
  const items: (ListingCandidate & { _publishedAtMs: number })[] = [];
  for (let i = 0; i < noiseRecent; i++) {
    items.push(
      candidate(i, {
        rent: 200_000 + (i % 20) * 10_000,
        rooms: 1,
        district: 'Moungali',
      }) as ListingCandidate & { _publishedAtMs: number },
    );
  }
  // Éligibles récents « moyens » (après les 480 premiers si noiseRecent>=480)
  for (let i = noiseRecent; i < noiseRecent + 40; i++) {
    items.push(
      candidate(i, {
        rent: 160_000 + (i % 5) * 1_000,
        rooms: 2,
        district: i % 2 === 0 ? 'Poto-Poto' : 'Bacongo',
      }) as ListingCandidate & { _publishedAtMs: number },
    );
  }
  const needleIds: string[] = [];
  for (let n = 0; n < 5; n++) {
    const id = `needle-${n}`;
    needleIds.push(id);
    items.push(
      candidate(10_000 + n, {
        id,
        rent: 140_000 + n * 500,
        rooms: 2,
        district: 'Poto-Poto',
        publishedAt: new Date(Date.UTC(2025, 0, 1 + n)),
        description: '2 pièces idéal Poto-Poto',
      }) as ListingCandidate & { _publishedAtMs: number },
    );
  }
  items.push(
    candidate(20_000, {
      id: 'occ-1',
      status: 'OCCUPIED',
      rent: 100_000,
      rooms: 2,
      publishedAt: new Date(),
    }) as ListingCandidate & { _publishedAtMs: number },
  );
  items.push(
    candidate(20_001, {
      id: 'unpub-1',
      published: false,
      rent: 100_000,
      rooms: 2,
      publishedAt: new Date(),
    }) as ListingCandidate & { _publishedAtMs: number },
  );
  items.push(
    candidate(20_002, {
      id: 'eur-1',
      currency: 'EUR',
      rent: 100_000,
      rooms: 2,
      publishedAt: new Date(),
    }) as ListingCandidate & { _publishedAtMs: number },
  );
  return { items, needleIds };
}

/** Ancienne stratégie : take 500 par publishedAt puis engine. */
function legacyRetrieve(items: (ListingCandidate & { _publishedAtMs: number })[]) {
  const sorted = [...items].sort(
    (a, b) => b._publishedAtMs - a._publishedAtMs || a.view.id.localeCompare(b.view.id),
  );
  return sorted.slice(0, MATCH_CANDIDATE_RECALL_LIMIT);
}

/** Nouvelle stratégie pure (sans Prisma) : hard filter mémoire + préselect score. */
function scoreAwarePipeline(items: ListingCandidate[], raw: RawDemandInput = DEMAND) {
  const { demand: merged } = mergeDemandWithText(raw);
  const demand = normalizeDemand(merged, { currency: 'XAF', locale: 'fr-CG' });
  const gate = filterEligible(items, demand);
  if (!gate.ok) {
    const empty = runMatchEngine(items, raw, { limit: 10 });
    return withRetrievalMeta(
      empty,
      buildRetrievalMeta({
        candidateCount: 0,
        truncated: false,
        eligibleTotal: 0,
      }),
    );
  }
  const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
  const result = runMatchEngine(pre.selected, raw, { limit: 10 });
  return withRetrievalMeta(
    { ...result, eligibleCount: pre.eligibleTotal },
    buildRetrievalMeta({
      candidateCount: pre.selected.length,
      truncated: pre.truncated,
      eligibleTotal: pre.eligibleTotal,
    }),
  );
}

describe('Phase 0D — hard-where SQL shape', () => {
  it('pousse budget, pièces, ville, quartier, devise', () => {
    const demand = normalizeDemand(DEMAND);
    const where = buildHardApartmentWhere(demand);
    expect(where.isPublished).toBe(true);
    expect(where.status).toBe('AVAILABLE');
    expect(where.rentAmount).toEqual({ lte: 180_000 });
    expect(where.rooms).toEqual({ gte: 2 });
    expect(where.organization).toEqual({ isActive: true, isValidated: true });
    expect(where.building).toBeDefined();
  });
});

describe('Phase 0D — préselection score-aware', () => {
  it('ne tronque pas sous le plafond', () => {
    const { items } = buildAdversarialCorpus(20);
    const demand = normalizeDemand(DEMAND);
    const gate = filterEligible(items, demand);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
    expect(pre.truncated).toBe(false);
    expect(pre.selected.length).toBe(gate.eligible.length);
  });

  it('tronque par score (pas publishedAt) quand |E| > 500', () => {
    const items: ListingCandidate[] = [];
    for (let i = 0; i < 600; i++) {
      items.push(
        candidate(i, {
          rent: 100_000 + i * 100,
          rooms: 2,
          district: 'Poto-Poto',
          publishedAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
        }),
      );
    }
    // Needle ancien très compétitif (loyer bas)
    items.push(
      candidate(9999, {
        id: 'needle-old-cheap',
        rent: 90_000,
        rooms: 2,
        district: 'Poto-Poto',
        publishedAt: new Date(Date.UTC(2024, 0, 1)),
      }),
    );
    const demand = normalizeDemand(DEMAND);
    const gate = filterEligible(items, demand);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.eligible.length).toBeGreaterThan(500);

    const legacyIds = new Set(
      legacyRetrieve(items as (ListingCandidate & { _publishedAtMs: number })[]).map((c) => c.view.id),
    );
    // Sans garantie stricte que needle soit hors legacy (dépend du corpus) — on vérifie la préselect
    const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
    expect(pre.truncated).toBe(true);
    expect(pre.selected.length).toBe(MATCH_CANDIDATE_RECALL_LIMIT);
    expect(pre.selected.some((c) => c.view.id === 'needle-old-cheap')).toBe(true);

    // Legacy take-by-date sur ce corpus ordonné : les 500 plus récents excluent souvent 2024
    if (!legacyIds.has('needle-old-cheap')) {
      expect(pre.selected.some((c) => c.view.id === 'needle-old-cheap')).toBe(true);
    }
  });

  it('départage déterministe à scores égaux (id)', () => {
    const twins = [0, 1, 2].map((i) =>
      candidate(i, {
        id: `twin-${2 - i}`,
        rent: 150_000,
        rooms: 2,
        district: 'Poto-Poto',
        publishedAt: new Date(Date.UTC(2026, 5, 1)),
      }),
    );
    const demand = normalizeDemand(DEMAND);
    const a = preselectByScore(twins, demand, 2);
    const b = preselectByScore(twins, demand, 2);
    expect(a.selected.map((c) => c.view.id)).toEqual(b.selected.map((c) => c.view.id));
  });
});

describe('Phase 0D — rappel adversatif (avant/après)', () => {
  it('legacy recall needles = 0 ; score-aware recall = 1 sur corpus ~520', () => {
    const { items, needleIds } = buildAdversarialCorpus(480);
    expect(items.length).toBeGreaterThan(500);

    const legacy = legacyRetrieve(items);
    expect(legacy.length).toBe(MATCH_CANDIDATE_RECALL_LIMIT);
    const legacyNeedleRecall =
      needleIds.filter((id) => legacy.some((c) => c.view.id === id)).length / needleIds.length;
    expect(legacyNeedleRecall).toBe(0);

    const after = scoreAwarePipeline(items);
    const demand = normalizeDemand(DEMAND);
    const gate = filterEligible(items, demand);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
    const recall =
      needleIds.filter((id) => pre.selected.some((c) => c.view.id === id)).length / needleIds.length;
    expect(recall).toBe(1);
    expect(after.retrieval?.strategy).toBe('hard_sql_score_preselect');
    expect(after.retrieval?.recallLimit).toBe(MATCH_CANDIDATE_RECALL_LIMIT);
    expect(assertNoPrivateLeak(after)).toEqual([]);
  });

  it('|E| > 500 : préselect garde les meilleurs loyers (needles) vs take-by-date', () => {
    const items: (ListingCandidate & { _publishedAtMs: number })[] = [];
    // 600 éligibles récents plus chers
    for (let i = 0; i < 600; i++) {
      items.push(
        candidate(i, {
          rent: 170_000,
          rooms: 2,
          district: 'Poto-Poto',
          publishedAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000),
        }) as ListingCandidate & { _publishedAtMs: number },
      );
    }
    for (let n = 0; n < 5; n++) {
      items.push(
        candidate(9000 + n, {
          id: `needle-${n}`,
          rent: 120_000,
          rooms: 2,
          district: 'Poto-Poto',
          publishedAt: new Date(Date.UTC(2024, 0, 1 + n)),
        }) as ListingCandidate & { _publishedAtMs: number },
      );
    }
    const needleIds = [0, 1, 2, 3, 4].map((n) => `needle-${n}`);
    const legacyRecall =
      needleIds.filter((id) => legacyRetrieve(items).some((c) => c.view.id === id)).length /
      needleIds.length;
    expect(legacyRecall).toBe(0);

    const demand = normalizeDemand(DEMAND);
    const gate = filterEligible(items, demand);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.eligible.length).toBeGreaterThan(500);
    const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
    expect(pre.truncated).toBe(true);
    const recall =
      needleIds.filter((id) => pre.selected.some((c) => c.view.id === id)).length / needleIds.length;
    expect(recall).toBe(1);

    const result = scoreAwarePipeline(items);
    expect(result.retrieval?.truncated).toBe(true);
    expect(result.retrieval?.eligibleTotal).toBe(gate.eligible.length);
    expect(result.eligibleCount).toBe(gate.eligible.length);
    expect(result.retrieval?.candidateCount).toBe(MATCH_CANDIDATE_RECALL_LIMIT);
  });

  it('contraintes hard : OCCUPIED / unpub / EUR exclus ; EMPTY_ELIGIBLE conservé', () => {
    const { items } = buildAdversarialCorpus(30);
    const result = scoreAwarePipeline(items);
    const ids = result.matches.map((m) => m.listing.id);
    expect(ids).not.toContain('occ-1');
    expect(ids).not.toContain('unpub-1');
    expect(ids).not.toContain('eur-1');
    expect(result.matches.every((m) => m.listing.rentAmount <= DEMAND.maxRent)).toBe(true);

    const empty = scoreAwarePipeline(items, {
      maxRent: 1,
      cities: ['VilleInexistanteXYZ'],
      currency: 'XAF',
    });
    expect(empty.emptyReason).toBe('EMPTY_ELIGIBLE');
    expect(empty.matches).toHaveLength(0);
    expect((empty.suggestions?.length ?? 0) > 0).toBe(true);
  });

  it('référence oracle : nDCG/precision sur top-10 du pipeline vs full eligible', () => {
    const { items, needleIds } = buildAdversarialCorpus(100);
    const demand = normalizeDemand(DEMAND);
    const gate = filterEligible(items, demand);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;

    const oracle = runMatchEngine(gate.eligible, DEMAND, { limit: 10 });
    const pipeline = scoreAwarePipeline(items);

    const grades: Record<string, number> = {};
    for (const id of needleIds) grades[id] = 3;
    for (const m of oracle.matches) if (grades[m.listing.id] == null) grades[m.listing.id] = 1;

    const oracleRel = relevancesForRanking(
      oracle.matches.map((m) => m.listing.id),
      grades,
    );
    const pipeRel = relevancesForRanking(
      pipeline.matches.map((m) => m.listing.id),
      grades,
    );

    expect(ndcgAtK(pipeRel, 10)).toBeCloseTo(ndcgAtK(oracleRel, 10), 5);
    expect(
      precisionAtK(
        pipeline.matches.map((m) => (grades[m.listing.id] ?? 0) >= 2),
        10,
      ),
    ).toBe(
      precisionAtK(
        oracle.matches.map((m) => (grades[m.listing.id] ?? 0) >= 2),
        10,
      ),
    );
  });
});
