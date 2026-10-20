/**
 * GO-TOOL-MATCH — U1–U6 (catalogue copilote ↔ MatchingService).
 */
import { AppError } from '../../src/shared/errors/app.error.js';
import {
  demandFromToolArgs,
  formatCatalogMatchForLocalReply,
  isCatalogMatchQuestion,
  parseCatalogMatchDemand,
  toCatalogMatchToolPayload,
} from '../../src/modules/ai/ai.catalog-match.js';
import {
  AiToolsService,
  formatToolResultForLocalReply,
} from '../../src/modules/ai/ai.tools.js';
import type { MatchResult } from '../../src/modules/intelligence/types.js';

function sampleMatchResult(overrides?: Partial<MatchResult>): MatchResult {
  return {
    demand: {
      maxRent: 300_000,
      minRooms: 1,
      currency: 'XAF',
      locale: 'fr-CG',
      partial: false,
      cities: ['Brazzaville'],
    },
    matches: [
      {
        listing: {
          id: 'apt-1',
          label: 'Appt Test',
          description: null,
          rooms: 3,
          surface: 60,
          floor: 1,
          rentAmount: 150_000,
          currency: 'XAF',
          status: 'AVAILABLE',
          publishedAt: '2026-10-20T00:00:00.000Z',
          amenities: [],
          photoUrls: [],
          provenance: 'INTERNAL_GESTION',
          building: {
            name: 'Immeuble A',
            address: '1 rue',
            district: null,
            city: 'Brazzaville',
            latitude: null,
            longitude: null,
          },
          organization: { id: 'org', name: 'Org', type: 'AGENCY' },
          quality: {
            score: 50,
            hasPhotos: false,
            hasDescription: false,
            freshnessDays: 1,
            flags: [],
          },
        },
        score: 0.8,
        factors: [],
        scorerVersion: '0.2.0',
      },
    ],
    eligibleCount: 1,
    scorerVersion: '0.2.0',
    retrieval: {
      strategy: 'hard_sql_score_preselect',
      sqlFetchMode: 'rent_asc',
      candidateCount: 1,
      truncated: false,
      recallLimit: 500,
      eligibleTotal: 1,
      sqlFetchCount: 1,
      sqlMatchCount: 1,
    },
    ...overrides,
  };
}

describe('GO-TOOL-MATCH — intent & parse (B2)', () => {
  it('U5 — n’invente pas minRooms / ville absents', () => {
    const { demand, fieldsFromMessage } = parseCatalogMatchDemand('cherche un logement');
    expect(demand.minRooms).toBeUndefined();
    expect(demand.cities).toBeUndefined();
    expect(fieldsFromMessage).not.toContain('minRooms');
  });

  it('extrait minRooms, maxRent et ville quand explicites', () => {
    const { demand, fieldsFromMessage } = parseCatalogMatchDemand(
      'Trouve un 3 pièces à Brazzaville budget 300k XAF',
    );
    expect(demand.minRooms).toBe(3);
    expect(demand.maxRent).toBe(300_000);
    expect(demand.cities).toEqual(['Brazzaville']);
    expect(fieldsFromMessage).toEqual(expect.arrayContaining(['minRooms', 'maxRent', 'cities']));
  });

  it('U6 — mes impayés / vacants / logements ne passent pas par le catalogue', () => {
    expect(isCatalogMatchQuestion('mes impayés')).toBe(false);
    expect(isCatalogMatchQuestion('Quels logements sont vacants ?')).toBe(false);
    expect(isCatalogMatchQuestion('mes logements')).toBe(false);
    expect(isCatalogMatchQuestion('Trouve un appartement 2 pièces à Pointe-Noire')).toBe(true);
  });
});

describe('GO-TOOL-MATCH — format Data-First (B3/B4/B5)', () => {
  it('U2/B4 — sqlMatchCount préservé dans le payload outil', () => {
    const payload = toCatalogMatchToolPayload(sampleMatchResult(), ['minRooms']);
    expect(payload.sqlMatchCount).toBe(1);
    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0]!.rooms).toBe(3);
  });

  it('U3 — empty ≠ invention de listing', () => {
    const payload = toCatalogMatchToolPayload(
      sampleMatchResult({
        matches: [],
        eligibleCount: 0,
        emptyReason: 'EMPTY_ELIGIBLE',
        retrieval: {
          strategy: 'hard_sql_score_preselect',
          candidateCount: 0,
          truncated: false,
          recallLimit: 500,
          eligibleTotal: 0,
          sqlFetchCount: 0,
          sqlMatchCount: 0,
        },
      }),
      ['minRooms'],
    );
    const text = formatCatalogMatchForLocalReply(payload);
    expect(text).toContain('**Fait**');
    expect(text).toContain('sqlMatchCount=0');
    expect(text).not.toContain('Appt Test');
    expect(text).toMatch(/aucun logement éligible/i);
  });

  it('U4 — erreur technique distincte de empty', () => {
    const text = formatCatalogMatchForLocalReply({
      error: 'Moteur de correspondance désactivé',
      code: 503,
    });
    expect(text).toContain('**Fait**');
    expect(text).toMatch(/erreur technique/i);
    expect(text).toContain('503');
    expect(text).not.toMatch(/sqlMatchCount=0/);
  });
});

describe('GO-TOOL-MATCH — AiToolsService ↔ MatchingService (B1)', () => {
  function buildTools(matchImpl: jest.Mock) {
    return new AiToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { match: matchImpl } as never,
    );
  }

  it('U1 — args → MatchingService.match avec critères (sans inventer)', async () => {
    const match = jest.fn(async () => sampleMatchResult());
    const tools = buildTools(match);
    const result = (await tools.execute('org-jwt', 'matchCatalogListings', {
      minRooms: 1,
      maxRent: 300_000,
      cities: ['Brazzaville'],
      currency: 'XAF',
      limit: 5,
      organizationId: 'evil-org',
    })) as { sqlMatchCount: number; matches: unknown[] };

    expect(match).toHaveBeenCalledTimes(1);
    const call = match.mock.calls[0] as unknown as [Record<string, unknown>, number];
    const demand = call[0];
    const limit = call[1];
    expect(demand).toEqual(
      expect.objectContaining({
        minRooms: 1,
        maxRent: 300_000,
        cities: ['Brazzaville'],
        currency: 'XAF',
      }),
    );
    expect(demand).not.toHaveProperty('organizationId');
    expect(limit).toBe(5);
    expect(result.sqlMatchCount).toBe(1);
    expect(result.matches).toHaveLength(1);
  });

  it('U2 — sqlMatchCount outil === valeur renvoyée par match (identité)', async () => {
    const match = jest.fn(async () =>
      sampleMatchResult({
        retrieval: {
          strategy: 'hard_sql_score_preselect',
          candidateCount: 2,
          truncated: false,
          recallLimit: 500,
          sqlMatchCount: 7,
          sqlFetchCount: 7,
          eligibleTotal: 2,
        },
      }),
    );
    const tools = buildTools(match);
    const result = (await tools.execute('org', 'matchCatalogListings', {
      text: 'cherche un 1 pièce budget 200k à Brazzaville',
    })) as { sqlMatchCount: number };
    expect(result.sqlMatchCount).toBe(7);
  });

  it('U4 — erreur MatchingService → error/code sans matches inventés', async () => {
    const match = jest.fn(async () => {
      throw new AppError(503, 'Moteur de correspondance désactivé', 'INTELLIGENCE_DISABLED');
    });
    const tools = buildTools(match);
    const result = (await tools.execute('org', 'matchCatalogListings', {
      minRooms: 1,
    })) as { error: string; code: number; matches?: unknown };
    expect(result.error).toMatch(/désactivé/i);
    expect(result.code).toBe(503);
    expect(result.matches).toBeUndefined();
    const reply = formatToolResultForLocalReply('matchCatalogListings', result);
    expect(reply).toMatch(/erreur technique/i);
  });

  it('U6 — resolveLocalToolIntents : parc org ≠ catalogue', () => {
    const tools = buildTools(jest.fn());
    expect(tools.resolveLocalToolIntents('mes impayés').map((i) => i.name)).toContain(
      'getOutstandingPayments',
    );
    expect(tools.resolveLocalToolIntents('mes impayés').map((i) => i.name)).not.toContain(
      'matchCatalogListings',
    );
    expect(tools.resolveLocalToolIntents('logements vacants').map((i) => i.name)).toContain(
      'getVacantUnits',
    );
    expect(tools.resolveLocalToolIntents('logements vacants').map((i) => i.name)).not.toContain(
      'matchCatalogListings',
    );
    expect(
      tools.resolveLocalToolIntents('Trouve un 3 pièces à Brazzaville max 300k').map((i) => i.name),
    ).toContain('matchCatalogListings');
  });

  it('demandFromToolArgs n’ajoute pas de minRooms fantôme', () => {
    expect(demandFromToolArgs({ maxRent: 100_000 }).minRooms).toBeUndefined();
  });
});
