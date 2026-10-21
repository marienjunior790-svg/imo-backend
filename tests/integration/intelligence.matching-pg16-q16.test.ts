/**
 * GO-MATCH-QUALITY-16 — trois validations PostgreSQL 16 pour la lecture Quality-14.
 *
 * Ne s'ouvre que sur la base de test de la CI : localhost, port 5432,
 * base immo_tec_test, RUN_DB_TESTS=true. Aucune lecture d'un fichier
 * d'environnement. Le moteur 18.4 éphémère est refusé.
 * L'ordre des dates nulles est observé, pas imposé.
 */
import { ApartmentStatus, OrganizationType, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { buildHardApartmentWhere } from '../../src/modules/intelligence/hard-where.js';
import { MatchingService } from '../../src/modules/intelligence/matching.service.js';
import { normalizeDemand } from '../../src/modules/intelligence/normalizer.js';
import { MATCH_SQL_FETCH_LIMIT } from '../../src/modules/intelligence/retrieval.js';
import { SCORER_VERSION } from '../../src/modules/intelligence/scorer-version.js';
import * as scorer from '../../src/modules/intelligence/scorer.js';
import { RENT_KEYSET_ORDER } from '../../src/modules/intelligence/sql-keyset.js';

const ORG = 'q16-org';
const PUBLISHED = new Date('2026-06-01T00:00:00.000Z');

type Gate = { ok: boolean; reason: string };

function inspectTarget(): Gate {
  if (process.env.RUN_DB_TESTS !== 'true') return { ok: false, reason: 'RUN_DB_TESTS absent' };
  if (process.env.Q11_EPHEMERAL_PG === '1') return { ok: false, reason: 'moteur éphémère refusé' };
  const raw = process.env.DATABASE_URL;
  if (!raw) return { ok: false, reason: 'DATABASE_URL absent' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'DATABASE_URL illisible' };
  }
  const host = url.hostname;
  const database = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] ?? '');
  const port = url.port || '5432';
  const local = host === '127.0.0.1' || host === 'localhost';
  if (local && database === 'immo_tec_test' && port === '5432') {
    return { ok: true, reason: 'ci-immo_tec_test' };
  }
  return { ok: false, reason: 'cible hors base de test CI' };
}

const gate = inspectTarget();
const describeDb = gate.ok ? describe : describe.skip;

describeDb(`GO-MATCH-QUALITY-16 — PostgreSQL 16 (${gate.reason})`, () => {
  jest.setTimeout(180_000);
  const prisma = new PrismaClient();
  const matching = new MatchingService(prisma as unknown as PrismaService);

  async function insertApartments(rows: Prisma.ApartmentCreateManyInput[]): Promise<void> {
    const size = 2_000;
    for (let index = 0; index < rows.length; index += size) {
      await prisma.apartment.createMany({ data: rows.slice(index, index + size) });
    }
  }

  beforeAll(async () => {
    const ident = await prisma.$queryRaw<
      Array<{ version: string; db: string; port: number; encoding: string; collate: string }>
    >`
      SELECT version() AS version,
             current_database() AS db,
             inet_server_port()::int AS port,
             current_setting('server_encoding') AS encoding,
             current_setting('lc_collate') AS collate
    `;
    const row = ident[0];
    if (!row || row.db !== 'immo_tec_test' || Number(row.port) !== 5432) {
      throw new Error('Quality-16 refuse la cible après connexion');
    }
    if (!row.version.startsWith('PostgreSQL 16')) {
      throw new Error(`Quality-16 attend PostgreSQL 16, reçu ${row.version.split(',')[0]}`);
    }
    process.stdout.write(
      `q16 engine=${row.version.split(',')[0]} encoding=${row.encoding} collate=${row.collate}\n`,
    );

    await prisma.organization.create({
      data: { id: ORG, name: 'Q16', type: OrganizationType.AGENCY },
    });
    await prisma.building.createMany({
      data: [
        { id: 'q16-b-poto', organizationId: ORG, name: 'Poto', address: '1 cat poto', district: 'Poto-Poto', city: 'Q16Catalog' },
        { id: 'q16-b-mou', organizationId: ORG, name: 'Mou', address: '2 cat mou', district: 'Moungali', city: 'Q16Catalog' },
        { id: 'q16-b-bac', organizationId: ORG, name: 'Bac', address: '3 cat bac', district: 'Bacongo', city: 'Q16Catalog' },
        { id: 'q16-b-ord', organizationId: ORG, name: 'Ord', address: '4 ordre', district: 'Poto-Poto', city: 'Q16Order' },
        { id: 'q16-b-bulk-bac', organizationId: ORG, name: 'Bulk bac', address: '5 bulk bac', district: 'Bacongo', city: 'Q16Bulk' },
        { id: 'q16-b-bulk-mou', organizationId: ORG, name: 'Bulk mou', address: '6 bulk mou', district: 'Moungali', city: 'Q16Bulk' },
        { id: 'q16-b-bulk-poto', organizationId: ORG, name: 'Bulk poto', address: '7 bulk poto', district: 'Poto-Poto', city: 'Q16Bulk' },
      ],
    });
    await insertApartments([
      apt('q16-cat-poto', 'q16-b-poto', 200_000, 2),
      apt('q16-cat-mou', 'q16-b-mou', 180_000, 2),
      apt('q16-cat-bac', 'q16-b-bac', 190_000, 2),
      apt('q16-cat-one', 'q16-b-poto', 100_000, 1),
      { ...apt('q16-cat-off', 'q16-b-poto', 170_000, 2), isPublished: false, publishedAt: null },
      apt('q16-ord-b', 'q16-b-ord', 100, 2, new Date('2026-01-02T00:00:00.000Z')),
      apt('q16-ord-a', 'q16-b-ord', 100, 2, new Date('2026-01-02T00:00:00.000Z')),
      apt('q16-ord-c', 'q16-b-ord', 100, 2, new Date('2026-01-03T00:00:00.000Z')),
      apt('q16-ord-n1', 'q16-b-ord', 100, 2, null),
      apt('q16-ord-n2', 'q16-b-ord', 100, 2, null),
      apt('q16-ord-d', 'q16-b-ord', 200, 2, new Date('2026-01-01T00:00:00.000Z')),
    ]);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: ORG } });
    await prisma.$disconnect();
  });

  it('A — le catalogue lit les filtres stricts et laisse l’exclusion hors du SQL', async () => {
    const obligatory = await matching.match(
      { cities: ['Q16Catalog'], districts: ['Poto-Poto'], minRooms: 2, currency: 'XAF' },
      10,
    );
    expect(obligatory.scorerVersion).toBe(SCORER_VERSION);
    expect(obligatory.scorerVersion).toBe('0.2.0');
    expect(obligatory.retrieval?.completeness).toBe('complete');
    expect(obligatory.retrieval?.sqlMatchCount).toBe(1);
    expect(obligatory.matches.map((match) => match.listing.id)).toEqual(['q16-cat-poto']);

    const where = buildHardApartmentWhere(
      normalizeDemand(
        { cities: ['Q16Catalog'], districts: ['Poto-Poto'], excludedDistricts: ['Bacongo'], currency: 'XAF' },
        { currency: 'XAF', locale: 'fr-CG' },
      ),
    );
    const serialized = JSON.stringify(where);
    expect(serialized).toContain('Poto-Poto');
    expect(serialized).not.toContain('Bacongo');

    const excluded = await matching.match(
      {
        cities: ['Q16Catalog'],
        minRooms: 2,
        maxRent: 300_000,
        excludedDistricts: ['Bacongo'],
        currency: 'XAF',
      },
      10,
    );
    expect(excluded.retrieval?.sqlMatchCount).toBe(3);
    expect(excluded.retrieval?.completeness).toBe('complete');
    expect(excluded.eligibleCount).toBe(2);
    expect(excluded.emptyReason).toBeUndefined();
    expect(excluded.matches.map((match) => match.listing.id).sort()).toEqual(['q16-cat-mou', 'q16-cat-poto']);

    const preferred = await matching.match(
      {
        cities: ['Q16Catalog'],
        minRooms: 2,
        maxRent: 300_000,
        preferredDistricts: ['Poto-Poto'],
        currency: 'XAF',
      },
      10,
    );
    expect(preferred.retrieval?.sqlMatchCount).toBe(3);
    expect(preferred.matches.map((match) => match.listing.id)).toEqual([
      'q16-cat-poto',
      'q16-cat-mou',
      'q16-cat-bac',
    ]);
  });

  it('B — loyer, date et identifiant ; les dates nulles restent groupées sans ordre imposé', async () => {
    const ordered = await prisma.apartment.findMany({
      where: { building: { city: 'Q16Order' } },
      orderBy: RENT_KEYSET_ORDER,
      select: { id: true, rentAmount: true, publishedAt: true },
    });
    const again = await prisma.apartment.findMany({
      where: { building: { city: 'Q16Order' } },
      orderBy: RENT_KEYSET_ORDER,
      select: { id: true, rentAmount: true, publishedAt: true },
    });
    const raw = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT a.id
      FROM apartments a
      JOIN buildings b ON b.id = a."buildingId"
      WHERE b.city = 'Q16Order'
      ORDER BY a."rentAmount" ASC, a."publishedAt" DESC, a.id ASC
    `;

    expect(again.map((row) => row.id)).toEqual(ordered.map((row) => row.id));
    expect(raw.map((row) => row.id)).toEqual(ordered.map((row) => row.id));
    expect(ordered.map((row) => Number(row.rentAmount))).toEqual([100, 100, 100, 100, 100, 200]);
    expect(ordered[ordered.length - 1]?.id).toBe('q16-ord-d');

    const sameRent = ordered.filter((row) => Number(row.rentAmount) === 100);
    const dated = sameRent.filter((row) => row.publishedAt != null).map((row) => row.id);
    const nulls = sameRent.filter((row) => row.publishedAt == null).map((row) => row.id);
    expect(dated).toEqual(['q16-ord-c', 'q16-ord-a', 'q16-ord-b']);
    expect(nulls).toEqual(['q16-ord-n1', 'q16-ord-n2']);
    const observed = sameRent.map((row) => row.id).join(',');
    const beforeDated = [...nulls, ...dated].join(',');
    const afterDated = [...dated, ...nulls].join(',');
    expect([beforeDated, afterDated]).toContain(observed);
    process.stdout.write(
      `q16 null publishedAt placement=${observed === beforeDated ? 'before-dated' : 'after-dated'}\n`,
    );
  });

  it('C — au-delà de 10 000, l’exclu en tête ne cache pas le préféré plus cher', async () => {
    const bulk: Prisma.ApartmentCreateManyInput[] = [];
    for (let index = 0; index < MATCH_SQL_FETCH_LIMIT; index += 1) {
      bulk.push(apt(`q16-ex-${String(index).padStart(5, '0')}`, 'q16-b-bulk-bac', 50_000, 2));
    }
    bulk.push(apt('q16-bulk-cheap', 'q16-b-bulk-mou', 100_000, 2));
    bulk.push(apt('q16-bulk-pref', 'q16-b-bulk-poto', 110_000, 2));
    await insertApartments(bulk);

    const rank = jest.spyOn(scorer, 'rankMatches');
    const result = await matching.match(
      {
        cities: ['Q16Bulk'],
        minRooms: 2,
        maxRent: 300_000,
        excludedDistricts: ['Bacongo'],
        preferredDistricts: ['Poto-Poto'],
        currency: 'XAF',
      },
      5,
    );
    expect(rank).toHaveBeenCalledTimes(1);
    rank.mockRestore();

    expect(result.scorerVersion).toBe('0.2.0');
    expect(result.retrieval?.completeness).toBe('complete');
    expect(result.retrieval?.batches).toBe(2);
    expect(result.retrieval?.sqlMatchCount).toBe(MATCH_SQL_FETCH_LIMIT + 2);
    expect(result.retrieval?.sqlFetchCount).toBe(MATCH_SQL_FETCH_LIMIT + 2);
    expect(result.eligibleCount).toBe(2);
    expect(result.emptyReason).toBeUndefined();
    expect(result.matches.map((match) => match.listing.id)).toEqual(['q16-bulk-pref', 'q16-bulk-cheap']);
    expect(result.matches.every((match) => match.listing.building?.district !== 'Bacongo')).toBe(true);
    expect(result.matches[0]!.listing.rentAmount).toBeGreaterThan(result.matches[1]!.listing.rentAmount);
  });
});

function apt(
  id: string,
  buildingId: string,
  rentAmount: number,
  rooms: number,
  publishedAt: Date | null = PUBLISHED,
): Prisma.ApartmentCreateManyInput {
  return {
    id,
    organizationId: ORG,
    buildingId,
    label: id,
    rooms,
    surface: 45,
    rentAmount,
    currency: 'XAF',
    status: ApartmentStatus.AVAILABLE,
    description: 'desc',
    isPublished: true,
    publishedAt,
  };
}
