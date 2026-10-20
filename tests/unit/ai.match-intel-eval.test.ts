/**
 * GO-MATCH-EVAL-2 — filet déterministe NL → outils exécutés + demand + gold B2.
 * Aucun appel API, aucune donnée personnelle. Le texte de réponse n'est pas la preuve.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isCatalogMatchQuestion,
  parseCatalogMatchDemand,
  shouldSkipLeaseDraftForCatalogSearch,
} from '../../src/modules/ai/ai.catalog-match.js';
import { AiToolsService } from '../../src/modules/ai/ai.tools.js';
import { goldSuitePassed, runGoldB2Suite } from '../../src/modules/intelligence/eval-harness.js';
import { goldB2Corpus } from '../../src/modules/intelligence/gold/b2-weighted.js';
import { runMatchEngine } from '../../src/modules/intelligence/matching.engine.js';
import type { MatchResult } from '../../src/modules/intelligence/types.js';

type DemandExpect = { minRooms?: number; maxRent?: number; cities?: string[] };

type EvalCase = {
  id: string;
  kind: string;
  message: string;
  expectCatalog: boolean;
  expectTools: string[];
  forbidTools: string[];
  expectDemand: DemandExpect;
  expectEmptyHard: boolean;
};

type EvalFixture = { version: string; cases: EvalCase[] };

const FIXTURE_PATH = path.join(process.cwd(), 'qa-e2e', 'match-intel-cases.json');
const DEMAND_KEYS = ['minRooms', 'maxRent', 'cities'] as const;

function loadFixture(): EvalFixture {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as EvalFixture;
}

function buildTools(match: jest.Mock = jest.fn()) {
  return new AiToolsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { match } as never,
  );
}

function stubMatchResult(demand: Record<string, unknown>): MatchResult {
  return {
    demand: {
      currency: typeof demand.currency === 'string' ? demand.currency : 'XAF',
      maxRent: typeof demand.maxRent === 'number' ? demand.maxRent : undefined,
      minRooms: typeof demand.minRooms === 'number' ? demand.minRooms : undefined,
      cities: Array.isArray(demand.cities) ? (demand.cities as string[]) : undefined,
    },
    matches: [],
    eligibleCount: 0,
    scorerVersion: 'eval-stub',
    retrieval: {
      strategy: 'hard_sql_score_preselect',
      candidateCount: 0,
      truncated: false,
      recallLimit: 5,
      sqlMatchCount: 0,
      sqlFetchCount: 0,
    },
  } as unknown as MatchResult;
}

/** Même boucle que AiService : intents résolus, puis execute(nom, args). */
async function dispatchIntents(tools: AiToolsService, message: string) {
  const intents = tools.resolveLocalToolIntents(message);
  const executed: string[] = [];
  for (const intent of intents) {
    executed.push(intent.name);
    await tools.execute('org-eval-fixture', intent.name, intent.args ?? {});
  }
  return { intents, executed };
}

describe('GO-MATCH-EVAL-2 — couverture du jeu', () => {
  const fixture = loadFixture();

  it('charge une fixture versionnée, synthétique et stable à la relecture', () => {
    expect(fixture.version).toBe('1.1.0');
    expect(fixture.cases.length).toBeGreaterThanOrEqual(12);
    const again = loadFixture();
    expect(again).toEqual(fixture);
    const ids = fixture.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('couvre budget+pièces+ville, sans chiffres, impayés, contrats, vides, ambigus', () => {
    const cases = fixture.cases;
    expect(
      cases.some(
        (c) =>
          c.expectCatalog &&
          c.expectDemand.minRooms != null &&
          c.expectDemand.maxRent != null &&
          (c.expectDemand.cities?.length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      cases.some(
        (c) =>
          c.expectCatalog &&
          c.expectDemand.minRooms == null &&
          c.expectDemand.maxRent == null &&
          !(c.expectDemand.cities?.length),
      ),
    ).toBe(true);
    expect(cases.some((c) => c.expectTools.includes('getOutstandingPayments'))).toBe(true);
    expect(cases.some((c) => c.expectTools.includes('proposeCreateLease'))).toBe(true);
    expect(cases.some((c) => c.expectEmptyHard)).toBe(true);
    expect(cases.some((c) => c.kind === 'ambiguous')).toBe(true);
  });

  it('ne contient ni email, ni téléphone, ni nom de personne du smoke historique', () => {
    const email = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
    const phone = /(?:\+\d{1,3}[\s-]?)?(?:\d[\s.-]?){8,}\d/;
    const blockedNames = /\b(yannick|jean|marie|paul)\b/i;
    for (const c of fixture.cases) {
      expect(c.message).not.toMatch(email);
      expect(c.message).not.toMatch(phone);
      expect(c.message).not.toMatch(blockedNames);
      expect(c.message.length).toBeGreaterThan(0);
    }
  });
});

describe('GO-MATCH-EVAL-2 — outils exécutés et demand', () => {
  const fixture = loadFixture();

  it.each(fixture.cases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const match = jest.fn(async (demand: Record<string, unknown>) => stubMatchResult(demand));
    const tools = buildTools(match);

    const first = await dispatchIntents(tools, c.message);
    const second = await dispatchIntents(tools, c.message);
    expect(second.executed).toEqual(first.executed);
    expect(second.intents.map((i) => i.args)).toEqual(first.intents.map((i) => i.args));

    expect(isCatalogMatchQuestion(c.message)).toBe(c.expectCatalog);
    expect(shouldSkipLeaseDraftForCatalogSearch(c.message)).toBe(c.expectCatalog);
    expect(first.executed).toEqual(c.expectTools);
    for (const forbidden of c.forbidTools) {
      expect(first.executed).not.toContain(forbidden);
    }

    const parsedA = parseCatalogMatchDemand(c.message);
    const parsedB = parseCatalogMatchDemand(c.message);
    expect(parsedB).toEqual(parsedA);

    for (const key of DEMAND_KEYS) {
      const expected = c.expectDemand[key];
      if (expected != null && !(Array.isArray(expected) && expected.length === 0)) {
        expect(parsedA.demand[key]).toEqual(expected);
        expect(parsedA.fieldsFromMessage).toContain(key);
      } else if (c.expectCatalog || c.id === 'N6-contrat-avec-loyer') {
        if (c.expectDemand[key] == null) {
          expect(parsedA.demand[key]).toBeUndefined();
          expect(parsedA.fieldsFromMessage).not.toContain(key);
        }
      }
    }

    const catalogCalls = match.mock.calls;
    if (c.expectTools.includes('matchCatalogListings')) {
      expect(catalogCalls.length).toBeGreaterThanOrEqual(1);
      const passed = catalogCalls[0][0] as DemandExpect;
      if (c.expectDemand.minRooms != null) expect(passed.minRooms).toBe(c.expectDemand.minRooms);
      else expect(passed.minRooms).toBeUndefined();
      if (c.expectDemand.maxRent != null) expect(passed.maxRent).toBe(c.expectDemand.maxRent);
      else expect(passed.maxRent).toBeUndefined();
      if (c.expectDemand.cities?.length) expect(passed.cities).toEqual(c.expectDemand.cities);
      else expect(passed.cities).toBeUndefined();
    } else {
      expect(catalogCalls).toHaveLength(0);
    }
  });
});

describe('GO-MATCH-EVAL-2 — vides et non-vides sur gold B2', () => {
  const fixture = loadFixture();
  const corpus = goldB2Corpus();

  it.each(
    fixture.cases.filter((c) => c.expectCatalog).map((c) => [c.id, c] as const),
  )('%s', (_id, c) => {
    const { demand } = parseCatalogMatchDemand(c.message);
    const input = { ...demand, currency: demand.currency ?? 'XAF' };
    const a = runMatchEngine(corpus, input);
    const b = runMatchEngine(corpus, input);
    expect(b.matches.map((m) => m.listing.id)).toEqual(a.matches.map((m) => m.listing.id));
    expect(b.emptyReason).toBe(a.emptyReason);

    if (c.expectEmptyHard) {
      expect(a.emptyReason).toBe('EMPTY_ELIGIBLE');
      expect(a.matches).toHaveLength(0);
    } else {
      expect(a.matches.length).toBeGreaterThan(0);
      expect(a.emptyReason).toBeUndefined();
    }
  });
});

describe('GO-MATCH-EVAL-2 — gold B2 ranking reproductible', () => {
  it('deux passes identiques et suite nDCG verte', () => {
    const a = runGoldB2Suite();
    const b = runGoldB2Suite();
    expect(b.map((r) => ({ id: r.id, pass: r.pass }))).toEqual(
      a.map((r) => ({ id: r.id, pass: r.pass })),
    );
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(goldSuitePassed(a)).toBe(true);
    expect(goldSuitePassed(b)).toBe(true);
  });
});
