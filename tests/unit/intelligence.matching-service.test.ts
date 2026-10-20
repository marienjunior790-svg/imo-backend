/**
 * R2-10 — non-régression MatchingService (Prisma mocké, soft/préselect/engine réels).
 * Socle : C1, C3, C4, C5, C6, C9 + identité sqlMatchCount.
 */
import { ApartmentStatus } from '@prisma/client';
import { MatchingService } from '../../src/modules/intelligence/matching.service.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

jest.mock('../../src/config/env.js', () => {
  const actual = jest.requireActual('../../src/config/env.js') as {
    env: Record<string, unknown>;
  };
  return {
    ...actual,
    env: {
      ...actual.env,
      INTELLIGENCE_MATCHING_ENABLED: true,
      INTELLIGENCE_SQL_FETCH_POLICY: 'rent_asc',
      DEFAULT_CURRENCY: 'XAF',
    },
  };
});

type AptRow = {
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
    latitude: number | null;
    longitude: number | null;
  };
  organization: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    isValidated: boolean;
  };
  documents: { cloudinaryUrl: string; type: string }[];
};

function baseOrg(overrides?: Partial<AptRow['organization']>): AptRow['organization'] {
  return {
    id: 'org-ok',
    name: 'Org OK',
    type: 'AGENCY',
    isActive: true,
    isValidated: true,
    ...overrides,
  };
}

function apt(partial: Partial<AptRow> & Pick<AptRow, 'id' | 'rooms' | 'rentAmount'>): AptRow {
  const org = partial.organization ?? baseOrg();
  return {
    id: partial.id,
    label: partial.label ?? `Unit ${partial.id}`,
    description: partial.description ?? 'desc',
    rooms: partial.rooms,
    surface: partial.surface ?? 40,
    floor: partial.floor ?? 1,
    rentAmount: partial.rentAmount,
    currency: partial.currency ?? 'XAF',
    status: partial.status ?? ApartmentStatus.AVAILABLE,
    isPublished: partial.isPublished ?? true,
    publishedAt: partial.publishedAt ?? new Date('2026-01-01T00:00:00Z'),
    amenities: partial.amenities ?? null,
    organizationId: org.id,
    building: partial.building ?? {
      name: 'Immeuble Test',
      address: '1 rue Test',
      district: null,
      city: 'Brazzaville',
      latitude: null,
      longitude: null,
    },
    organization: org,
    documents: partial.documents ?? [],
  };
}

function matchesWhere(row: AptRow, where: Record<string, unknown>): boolean {
  if (where.isPublished === true && !row.isPublished) return false;
  if (where.status != null && row.status !== where.status) return false;
  if (typeof where.currency === 'string' && row.currency.toUpperCase() !== where.currency.toUpperCase()) {
    return false;
  }
  const orgFilter = where.organization as { isActive?: boolean; isValidated?: boolean } | undefined;
  if (orgFilter) {
    if (orgFilter.isActive === true && !row.organization.isActive) return false;
    if (orgFilter.isValidated === true && !row.organization.isValidated) return false;
  }
  const rooms = where.rooms as { gte?: number } | undefined;
  if (rooms?.gte != null) {
    if (row.rooms == null || row.rooms < rooms.gte) return false;
  }
  const rent = where.rentAmount as { lte?: number; gte?: number } | undefined;
  if (rent?.lte != null && row.rentAmount > rent.lte) return false;
  if (rent?.gte != null && row.rentAmount < rent.gte) return false;
  return true;
}

function createPrismaMock(corpus: AptRow[]) {
  const count = jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return corpus.filter((r) => matchesWhere(r, where)).length;
  });
  const findMany = jest.fn(
    async ({
      where,
      take,
      orderBy,
    }: {
      where: Record<string, unknown>;
      take?: number;
      orderBy?: Array<Record<string, string>>;
    }) => {
      let rows = corpus.filter((r) => matchesWhere(r, where));
      if (orderBy?.length) {
        rows = [...rows].sort((a, b) => {
          for (const clause of orderBy) {
            const key = Object.keys(clause)[0]!;
            const dir = clause[key] === 'desc' ? -1 : 1;
            const av = (a as Record<string, unknown>)[key];
            const bv = (b as Record<string, unknown>)[key];
            if (av === bv) continue;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv!) return -1 * dir;
            if (av > bv!) return 1 * dir;
          }
          return 0;
        });
      }
      if (take != null) rows = rows.slice(0, take);
      return rows;
    },
  );
  return {
    apartment: { count, findMany },
    count,
    findMany,
  };
}

describe('R2-10 MatchingService — concordance count ↔ meta (mock Prisma)', () => {
  const demandBase = {
    maxRent: 300_000,
    minRooms: 1,
    currency: 'XAF' as const,
  };

  it('C1 — publié AVAILABLE XAF org OK rooms≥1 apparaît count+fetch+matches', async () => {
    const corpus = [apt({ id: 'c1', rooms: 1, rentAmount: 100_000 })];
    const store = createPrismaMock(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match(demandBase, 10);
    const counted = await store.count.mock.results[0]!.value;
    expect(result.retrieval?.sqlMatchCount).toBe(counted);
    expect(result.retrieval?.sqlMatchCount).toBe(1);
    expect(result.retrieval?.sqlFetchCount).toBe(1);
    expect(result.retrieval?.sqlFetchMode).toBe('rent_asc');
    expect(result.matches.length).toBe(1);
    expect(result.matches[0]!.listing.id).toBe('c1');
    expect(store.count).toHaveBeenCalledTimes(1);
    const where = store.count.mock.calls[0]![0].where;
    expect(where.rooms).toEqual({ gte: 1 });
    expect(where.isPublished).toBe(true);
  });

  it('C3 — rooms null exclu du hard quand minRooms=1', async () => {
    const corpus = [
      apt({ id: 'ok', rooms: 2, rentAmount: 120_000 }),
      apt({ id: 'null-rooms', rooms: null, rentAmount: 90_000 }),
    ];
    const store = createPrismaMock(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match(demandBase, 10);
    expect(result.retrieval?.sqlMatchCount).toBe(1);
    expect(result.matches.map((m) => m.listing.id)).toEqual(['ok']);
    expect(result.matches.some((m) => m.listing.id === 'null-rooms')).toBe(false);
  });

  it('C4 — rooms null inclus si minRooms absent (ancre hard)', async () => {
    const corpus = [apt({ id: 'null-rooms', rooms: null, rentAmount: 90_000 })];
    const store = createPrismaMock(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match({ maxRent: 300_000, currency: 'XAF' }, 10);
    expect(result.retrieval?.sqlMatchCount).toBe(1);
    expect(store.count.mock.calls[0]![0].where.rooms).toBeUndefined();
    expect(result.matches.length).toBe(1);
  });

  it('C5 — org inactive / non validée exclue du hard', async () => {
    const corpus = [
      apt({
        id: 'inactive',
        rooms: 2,
        rentAmount: 100_000,
        organization: baseOrg({ id: 'org-off', isActive: false }),
      }),
      apt({
        id: 'unvalidated',
        rooms: 2,
        rentAmount: 110_000,
        organization: baseOrg({ id: 'org-nv', isValidated: false }),
      }),
      apt({ id: 'ok', rooms: 2, rentAmount: 120_000 }),
    ];
    const store = createPrismaMock(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match(demandBase, 10);
    expect(result.retrieval?.sqlMatchCount).toBe(1);
    expect(result.matches.map((m) => m.listing.id)).toEqual(['ok']);
  });

  it('C6 — devise EUR exclue pour demande XAF', async () => {
    const corpus = [
      apt({ id: 'eur', rooms: 2, rentAmount: 100_000, currency: 'EUR' }),
      apt({ id: 'xaf', rooms: 2, rentAmount: 100_000, currency: 'XAF' }),
    ];
    const store = createPrismaMock(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match(demandBase, 10);
    expect(result.retrieval?.sqlMatchCount).toBe(1);
    expect(result.matches.map((m) => m.listing.id)).toEqual(['xaf']);
  });

  it('C9 — limit tronque matches ; sqlMatchCount reste le count hard', async () => {
    const corpus = Array.from({ length: 5 }, (_, i) =>
      apt({ id: `u${i}`, rooms: 2, rentAmount: 80_000 + i * 1000 }),
    );
    const store = createPrismaMock(corpus);
    const service = new MatchingService(store as unknown as PrismaService);
    const result = await service.match(demandBase, 2);
    expect(result.retrieval?.sqlMatchCount).toBe(5);
    expect(result.retrieval?.sqlFetchCount).toBe(5);
    expect(result.matches.length).toBe(2);
    expect(result.eligibleCount).toBeGreaterThanOrEqual(2);
    const eligibleTotal = result.retrieval?.eligibleTotal ?? 0;
    const candidateCount = result.retrieval?.candidateCount ?? 0;
    expect(candidateCount).toBeLessThanOrEqual(eligibleTotal);
    expect(eligibleTotal).toBeGreaterThanOrEqual(2);
  });
});
