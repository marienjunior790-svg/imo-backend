/**
 * GO-MATCH-EVAL-1 — filet P+/P−/ambigu + gold B2 ranking.
 * Lecture seule : fixtures JSON + intents locaux + moteur gold (pas d’API prod).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isCatalogMatchQuestion,
  parseCatalogMatchDemand,
} from '../../src/modules/ai/ai.catalog-match.js';
import { AiToolsService } from '../../src/modules/ai/ai.tools.js';
import { goldSuitePassed, runGoldB2Suite } from '../../src/modules/intelligence/eval-harness.js';
import { filterEligible } from '../../src/modules/intelligence/eligibility.js';
import { goldB2Corpus } from '../../src/modules/intelligence/gold/b2-weighted.js';
import { normalizeDemand } from '../../src/modules/intelligence/normalizer.js';
import { runMatchEngine } from '../../src/modules/intelligence/matching.engine.js';

type EvalCase = {
  id: string;
  kind: string;
  message: string;
  expectCatalog: boolean;
  expectTool: string | null;
  forbidTools: string[];
  expectDemand: { minRooms?: number; maxRent?: number; cities?: string[] };
  expectEmptyHard: boolean;
};

type EvalFixture = { version: string; cases: EvalCase[] };

function loadFixture(): EvalFixture {
  const p = path.join(process.cwd(), 'qa-e2e', 'match-intel-cases.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as EvalFixture;
}

function buildTools() {
  return new AiToolsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { match: jest.fn() } as never,
  );
}

describe('GO-MATCH-EVAL-1 — fixture NL intents', () => {
  const fixture = loadFixture();
  const tools = buildTools();

  it('charge la fixture versionnée', () => {
    expect(fixture.version).toBeTruthy();
    expect(fixture.cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(fixture.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(isCatalogMatchQuestion(c.message)).toBe(c.expectCatalog);

    const names = tools.resolveLocalToolIntents(c.message).map((i) => i.name);
    if (c.expectTool) {
      expect(names).toContain(c.expectTool);
    } else {
      expect(names).not.toContain('matchCatalogListings');
    }
    for (const forbidden of c.forbidTools ?? []) {
      expect(names).not.toContain(forbidden);
    }

    const { demand, fieldsFromMessage } = parseCatalogMatchDemand(c.message);
    if (c.expectDemand.minRooms != null) {
      expect(demand.minRooms).toBe(c.expectDemand.minRooms);
      expect(fieldsFromMessage).toContain('minRooms');
    } else if (c.expectCatalog) {
      expect(demand.minRooms).toBeUndefined();
    }
    if (c.expectDemand.maxRent != null) {
      expect(demand.maxRent).toBe(c.expectDemand.maxRent);
      expect(fieldsFromMessage).toContain('maxRent');
    } else if (c.expectCatalog && c.id === 'A3-seek-housing-vague-budget') {
      expect(demand.maxRent).toBeUndefined();
      expect(fieldsFromMessage).not.toContain('maxRent');
    }
    if (c.expectDemand.cities?.length) {
      expect(demand.cities).toEqual(expect.arrayContaining(c.expectDemand.cities));
    }
  });
});

describe('GO-MATCH-EVAL-1 — hard empty sur corpus gold (N1)', () => {
  it('minRooms=5 + maxRent=50k → EMPTY_ELIGIBLE sur gold B2', () => {
    const corpus = goldB2Corpus();
    const demand = normalizeDemand(
      { minRooms: 5, maxRent: 50_000, currency: 'XAF', cities: ['Brazzaville'] },
      { currency: 'XAF', locale: 'fr-CG' },
    );
    const gate = filterEligible(corpus, demand);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.code).toBe('EMPTY_ELIGIBLE');
    }
    const result = runMatchEngine(corpus, {
      minRooms: 5,
      maxRent: 50_000,
      currency: 'XAF',
      cities: ['Brazzaville'],
    });
    expect(result.emptyReason).toBe('EMPTY_ELIGIBLE');
    expect(result.matches).toHaveLength(0);
  });

  it('smoke A criteria → au moins 1 éligible sur gold B2 (rooms≥3 maxRent 300k)', () => {
    const corpus = goldB2Corpus();
    const gate = filterEligible(
      corpus,
      normalizeDemand(
        { minRooms: 3, maxRent: 300_000, currency: 'XAF', cities: ['Brazzaville'] },
        { currency: 'XAF', locale: 'fr-CG' },
      ),
    );
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.eligible.length).toBeGreaterThanOrEqual(1);
      expect(gate.eligible.every((c) => (c.view.rooms ?? 0) >= 3)).toBe(true);
      expect(gate.eligible.every((c) => c.view.rentAmount <= 300_000)).toBe(true);
    }
  });
});

describe('GO-MATCH-EVAL-1 — gold B2 ranking (CI4)', () => {
  it('suite gold B2 passe (nDCG / ordre)', () => {
    const results = runGoldB2Suite();
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.pass).toBe(true);
    }
    expect(goldSuitePassed(results)).toBe(true);
  });
});
