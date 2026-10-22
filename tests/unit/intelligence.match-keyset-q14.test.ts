/**
 * GO-MATCH-QUALITY-14 — lecture ordonnée au-delà de 10 000, exclusions inchangées.
 * Prisma est simulé. Ce fichier ne prouve pas PostgreSQL 16.
 */
import { ApartmentStatus } from '@prisma/client';
import { buildHardApartmentWhere } from '../../src/modules/intelligence/hard-where.js';
import { MatchingService } from '../../src/modules/intelligence/matching.service.js';
import { MATCH_SQL_FETCH_LIMIT } from '../../src/modules/intelligence/retrieval.js';
import { SCORER_VERSION } from '../../src/modules/intelligence/scorer-version.js';
import * as scorer from '../../src/modules/intelligence/scorer.js';
import { readKeysetPages, RENT_KEYSET_ORDER } from '../../src/modules/intelligence/sql-keyset.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

type Row = {
  id: string;
  label: string;
  description: string | null;
  rooms: number | null;
  surface: number | null;
  floor: number | null;
  rentAmount: number;
  currency: string;
  status: ApartmentStatus;
  isPublished: boolean;
  publishedAt: Date | null;
  amenities: string | null;
  organizationId: string;
  building: {
    name: string;
    address: string;
    district: string | null;
    city: string;
    latitude: null;
    longitude: null;
  } | null;
  organization: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    isValidated: boolean;
  };
  documents: [];
};

function row(partial: Partial<Row> & Pick<Row, 'id' | 'rentAmount'>): Row {
  return {
    id: partial.id,
    label: partial.label ?? partial.id,
    description: 'desc',
    rooms: partial.rooms ?? 2,
    surface: partial.surface ?? 45,
    floor: 1,
    rentAmount: partial.rentAmount,
    currency: 'XAF',
    status: ApartmentStatus.AVAILABLE,
    isPublished: true,
    publishedAt: partial.publishedAt ?? new Date('2026-06-01T00:00:00Z'),
    amenities: null,
    organizationId: 'org',
    building: {
      name: 'B',
      address: '1',
      district: 'Moungali',
      city: 'Brazzaville',
      latitude: null,
      longitude: null,
    },
    organization: {
      id: 'org',
      name: 'Org',
      type: 'AGENCY',
      isActive: true,
      isValidated: true,
    },
    documents: [],
  };
}

function withDistrict(id: string, rentAmount: number, district: string | null, publishedAt?: Date): Row {
  const base = row({ id, rentAmount, publishedAt });
  if (district === null) {
    return { ...base, building: base.building ? { ...base.building, district: null } : null };
  }
  return { ...base, building: base.building ? { ...base.building, district } : null };
}

function compareRent(a: Row, b: Row): number {
  if (a.rentAmount !== b.rentAmount) return a.rentAmount - b.rentAmount;
  const ad = a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bd = b.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (ad !== bd) return bd - ad;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function keysetStore(corpus: Row[], failOnBatch?: number) {
  let calls = 0;
  const count = jest.fn(async () => corpus.length);
  const findMany = jest.fn(
    async (args: { take: number; cursor?: { id: string }; skip?: number; orderBy?: unknown }) => {
      calls += 1;
      if (failOnBatch != null && calls === failOnBatch) {
        throw new Error('lot intermédiaire');
      }
      const sorted = [...corpus].sort(compareRent);
      let start = 0;
      if (args.cursor) {
        const idx = sorted.findIndex((item) => item.id === args.cursor!.id);
        if (idx < 0) throw new Error('curseur absent');
        start = idx + (args.skip ?? 0);
      }
      return sorted.slice(start, start + args.take);
    },
  );
  return { apartment: { count, findMany }, count, findMany };
}

describe('GO-MATCH-QUALITY-14 — parcours ordonné', () => {
  it('A — une annonce admissible après 10 000 exclus est récupérée, sqlMatchCount compte avant exclusion', async () => {
    const corpus: Row[] = [];
    for (let i = 0; i < MATCH_SQL_FETCH_LIMIT; i += 1) {
      corpus.push(withDistrict(`ex-${String(i).padStart(5, '0')}`, i + 1, 'Bacongo'));
    }
    corpus.push(withDistrict('ok-late', 9_000_000, 'Poto-Poto'));
    const store = keysetStore(corpus);
    const rank = jest.spyOn(scorer, 'rankMatches');
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match({ excludedDistricts: ['Bacongo'], currency: 'XAF' }, 5);

    expect(store.findMany).toHaveBeenCalledTimes(2);
    expect(store.findMany.mock.calls[0]![0].orderBy).toEqual(RENT_KEYSET_ORDER);
    expect(store.findMany.mock.calls[0]![0].take).toBe(MATCH_SQL_FETCH_LIMIT);
    expect(store.findMany.mock.calls[1]![0].cursor).toEqual({ id: 'ex-09999' });
    expect(store.findMany.mock.calls[1]![0].skip).toBe(1);
    expect(result.retrieval?.sqlMatchCount).toBe(MATCH_SQL_FETCH_LIMIT + 1);
    expect(result.retrieval?.sqlFetchCount).toBe(MATCH_SQL_FETCH_LIMIT + 1);
    expect(result.retrieval?.completeness).toBe('complete');
    expect(result.retrieval?.batches).toBe(2);
    expect(result.eligibleCount).toBe(1);
    expect(result.matches.map((match) => match.listing.id)).toEqual(['ok-late']);
    expect(result.matches.every((match) => match.listing.building?.district !== 'Bacongo')).toBe(true);
    expect(result.emptyReason).toBeUndefined();
    expect(result.scorerVersion).toBe(SCORER_VERSION);
    expect(result.scorerVersion).toBe('0.2.0');
    expect(rank).toHaveBeenCalledTimes(1);
    rank.mockRestore();
  });

  it('B — le logement préféré plus cher, au-delà des 10 000, est classé par le score', async () => {
    const corpus: Row[] = [];
    for (let i = 0; i < MATCH_SQL_FETCH_LIMIT; i += 1) {
      corpus.push(withDistrict(`ex-${String(i).padStart(5, '0')}`, 50_000, 'Bacongo'));
    }
    corpus.push(withDistrict('cheap-later', 100_000, 'Moungali'));
    corpus.push(withDistrict('pref-late', 110_000, 'Poto-Poto'));
    const store = keysetStore(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match(
      {
        maxRent: 300_000,
        minRooms: 2,
        excludedDistricts: ['Bacongo'],
        preferredDistricts: ['Poto-Poto'],
        currency: 'XAF',
      },
      3,
    );

    expect(result.retrieval?.completeness).toBe('complete');
    expect(result.retrieval?.sqlMatchCount).toBe(MATCH_SQL_FETCH_LIMIT + 2);
    expect(result.eligibleCount).toBe(2);
    expect(result.matches.map((match) => match.listing.id)).toEqual(['pref-late', 'cheap-later']);
    expect(result.matches.some((match) => match.listing.building?.district === 'Bacongo')).toBe(false);
    expect(result.scorerVersion).toBe('0.2.0');
  });

  it('C — lots stables : loyer, date, id, frontière et absence de doublon', async () => {
    const items = [
      { id: 'b', rentAmount: 100, publishedAt: new Date('2026-01-02T00:00:00Z') },
      { id: 'a', rentAmount: 100, publishedAt: new Date('2026-01-02T00:00:00Z') },
      { id: 'c', rentAmount: 100, publishedAt: new Date('2026-01-03T00:00:00Z') },
      { id: 'd', rentAmount: 200, publishedAt: new Date('2026-01-01T00:00:00Z') },
    ];
    const sorted = [...items].sort((left, right) => {
      if (left.rentAmount !== right.rentAmount) return left.rentAmount - right.rentAmount;
      const delta = right.publishedAt.getTime() - left.publishedAt.getTime();
      if (delta !== 0) return delta;
      return left.id < right.id ? -1 : 1;
    });
    const seenStarts: number[] = [];
    const read = async (query: { take: number; cursor?: { id: string }; skip?: number }) => {
      let start = 0;
      if (query.cursor) {
        start = sorted.findIndex((item) => item.id === query.cursor!.id) + (query.skip ?? 0);
      }
      seenStarts.push(start);
      return sorted.slice(start, start + query.take);
    };

    const even = await readKeysetPages({ batchSize: 2, read });
    expect(even.rows.map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(new Set(even.rows.map((item) => item.id)).size).toBe(4);
    expect(even.batches).toBe(3);
    expect(seenStarts).toEqual([0, 2, 4]);

    const five = [...sorted, { id: 'e', rentAmount: 300, publishedAt: new Date('2026-01-01T00:00:00Z') }];
    const odd = await readKeysetPages({
      batchSize: 2,
      read: async (query) => {
        let start = 0;
        if (query.cursor) start = five.findIndex((item) => item.id === query.cursor!.id) + (query.skip ?? 0);
        return five.slice(start, start + query.take);
      },
    });
    expect(odd.rows.map((item) => item.id)).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(odd.batches).toBe(3);

    await expect(
      readKeysetPages({
        batchSize: 2,
        read: async () => [sorted[0]!, sorted[0]!],
      }),
    ).rejects.toMatchObject({ code: 'MATCH_PAGE_DUPLICATE' });
  });

  it('D — exclusion contenue, quartier vide, exclusions multiples, obligation et préférence', async () => {
    const corpus = [
      withDistrict('short', 120_000, 'Poto'),
      withDistrict('empty', 130_000, null),
      withDistrict('blank', 140_000, ''),
      withDistrict('poto', 150_000, 'Poto-Poto'),
      withDistrict('mou', 155_000, 'Moungali'),
      withDistrict('bac', 160_000, 'Bacongo'),
    ];
    const blank = corpus.find((item) => item.id === 'blank')!;
    blank.building = blank.building ? { ...blank.building, district: '' } : null;
    const store = keysetStore(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const excluded = await service.match(
      { excludedDistricts: ['Poto-Poto', 'Bacongo'], currency: 'XAF' },
      10,
    );
    const ids = excluded.matches.map((match) => match.listing.id);
    expect(ids).not.toContain('short');
    expect(ids).not.toContain('bac');
    expect(ids).toEqual(expect.arrayContaining(['empty', 'blank', 'mou']));
    expect(excluded.retrieval?.sqlMatchCount).toBe(corpus.length);
    expect(excluded.retrieval?.completeness).toBe('complete');

    const where = buildHardApartmentWhere({
      districts: ['Moungali'],
      excludedDistricts: ['Bacongo'],
      preferredDistricts: ['Poto-Poto'],
      currency: 'XAF',
      locale: 'fr-CG',
      partial: false,
    });
    const serialized = JSON.stringify(where);
    expect(serialized).toContain('Moungali');
    expect(serialized).not.toContain('Bacongo');
    expect(serialized).not.toContain('Poto-Poto');

    const preferred = await service.match(
      { preferredDistricts: ['Poto-Poto'], currency: 'XAF', maxRent: 300_000 },
      10,
    );
    const preferredIds = preferred.matches.map((match) => match.listing.id);
    expect(preferredIds).toContain('mou');
    expect(preferredIds).toContain('poto');
    expect(preferredIds.indexOf('poto')).toBeLessThan(preferredIds.indexOf('mou'));
  });

  it('E — un lot en erreur n’est pas une recherche complète ni une absence de logements', async () => {
    const corpus: Row[] = [];
    for (let i = 0; i < MATCH_SQL_FETCH_LIMIT + 1; i += 1) {
      corpus.push(withDistrict(`row-${i}`, i + 1, 'Moungali'));
    }
    const store = keysetStore(corpus, 2);
    const service = new MatchingService(store as unknown as PrismaService);
    await expect(service.match({ currency: 'XAF' }, 5)).rejects.toThrow('lot intermédiaire');
  });
});
