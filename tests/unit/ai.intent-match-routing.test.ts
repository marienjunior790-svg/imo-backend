/**
 * GO-INTENT-MATCH — routage NL → matchCatalogListings vs contrat / impayés.
 * Régression smoke A (2026-10-20) : HTTP 200 sans outil, reply « Nouveau contrat ».
 */
import {
  isCatalogMatchQuestion,
  parseCatalogMatchDemand,
  shouldSkipLeaseDraftForCatalogSearch,
} from '../../src/modules/ai/ai.catalog-match.js';
import {
  LEASE_DRAFT_MARKER,
  collectLeaseDraftMessages,
  hasLeaseCreateCue,
  hasLeaseDetails,
  mentionsContract,
  parseLeaseFields,
} from '../../src/modules/ai/ai.lease-request.js';
import { AiToolsService } from '../../src/modules/ai/ai.tools.js';

/** Message exact du smoke A (COPILOTE-CHAT-SMOKE). */
const SMOKE_A =
  'Trouve-moi un logement de 3 pièces avec un loyer maximal de 300 000 XAF.';
const SMOKE_B = 'Analyse mes impayés et indique-moi les actions prioritaires.';

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

describe('GO-INTENT-MATCH — régression smoke A', () => {
  it('classifie la recherche catalogue (seek + housing)', () => {
    expect(isCatalogMatchQuestion(SMOKE_A)).toBe(true);
    expect(shouldSkipLeaseDraftForCatalogSearch(SMOKE_A)).toBe(true);
  });

  it('extrait minRooms=3 et maxRent=300000 (maximal + espaces)', () => {
    const { demand, fieldsFromMessage } = parseCatalogMatchDemand(SMOKE_A);
    expect(demand.minRooms).toBe(3);
    expect(demand.maxRent).toBe(300_000);
    expect(fieldsFromMessage).toEqual(expect.arrayContaining(['minRooms', 'maxRent']));
  });

  it('resolveLocalToolIntents appelle matchCatalogListings (pas impayés / pas getUnits)', () => {
    const names = buildTools().resolveLocalToolIntents(SMOKE_A).map((i) => i.name);
    expect(names).toContain('matchCatalogListings');
    expect(names).not.toContain('getOutstandingPayments');
    expect(names).not.toContain('getUnits');
  });

  it('prouve le vol historique : brouillon bail + loyer → continuation si non protégé', () => {
    expect(mentionsContract(SMOKE_A)).toBe(false);
    expect(hasLeaseCreateCue(SMOKE_A)).toBe(false);
    const fields = parseLeaseFields(SMOKE_A);
    expect(fields.monthlyRent).toBe(300_000);
    expect(hasLeaseDetails(fields)).toBe(true);

    const draft = collectLeaseDraftMessages(SMOKE_A, [
      { role: 'user', content: 'Crée un nouveau contrat' },
      { role: 'assistant', content: `${LEASE_DRAFT_MARKER} — pour quel locataire ?` },
    ]);
    expect(draft.length).toBeGreaterThan(1);
    // Garde-fou métier : avec historique, sans shouldSkip → handleContractRequest absorbait le message.
    expect(shouldSkipLeaseDraftForCatalogSearch(SMOKE_A)).toBe(true);
  });
});

describe('GO-INTENT-MATCH — non-régression intentions', () => {
  it('1 — critères explicites → matchCatalogListings', () => {
    const names = buildTools()
      .resolveLocalToolIntents('Trouve-moi un appartement de 3 pièces à 300 000 XAF maximum.')
      .map((i) => i.name);
    expect(names).toContain('matchCatalogListings');
  });

  it('2 — recherche générale → matchCatalogListings', () => {
    expect(isCatalogMatchQuestion('Je cherche un logement à louer.')).toBe(true);
    expect(
      buildTools().resolveLocalToolIntents('Je cherche un logement à louer.').map((i) => i.name),
    ).toContain('matchCatalogListings');
  });

  it('3 — critères serrés (peut être EMPTY_ELIGIBLE) → outil quand même', () => {
    const intents = buildTools().resolveLocalToolIntents(
      'Trouve un 5 pièces à 50 000 XAF maximum.',
    );
    expect(intents.map((i) => i.name)).toContain('matchCatalogListings');
    expect(intents.find((i) => i.name === 'matchCatalogListings')?.args).toMatchObject({
      minRooms: 5,
      maxRent: 50_000,
    });
  });

  it('4 — smoke B / impayés → getOutstandingPayments sans catalogue', () => {
    const names = buildTools().resolveLocalToolIntents(SMOKE_B).map((i) => i.name);
    expect(names).toContain('getOutstandingPayments');
    expect(names).not.toContain('matchCatalogListings');
    expect(shouldSkipLeaseDraftForCatalogSearch(SMOKE_B)).toBe(false);
  });

  it('5 — création contrat préservée (pas catalogue)', () => {
    const msg = 'Crée un nouveau contrat pour Jean';
    expect(mentionsContract(msg)).toBe(true);
    expect(hasLeaseCreateCue(msg)).toBe(true);
    expect(isCatalogMatchQuestion(msg)).toBe(false);
    expect(
      buildTools().resolveLocalToolIntents(msg).map((i) => i.name),
    ).not.toContain('matchCatalogListings');
  });

  it('6 — locataire / impayé ≠ catalogue', () => {
    expect(isCatalogMatchQuestion('Quels sont les impayés du locataire Yannick ?')).toBe(false);
    expect(
      buildTools()
        .resolveLocalToolIntents('Quels sont les impayés du locataire Yannick ?')
        .map((i) => i.name),
    ).toContain('getOutstandingPayments');
  });

  it('7 — sans outil catalogue : pas d’invention de critères fantômes', () => {
    const { demand, fieldsFromMessage } = parseCatalogMatchDemand('cherche un logement');
    expect(demand.minRooms).toBeUndefined();
    expect(demand.maxRent).toBeUndefined();
    expect(fieldsFromMessage).not.toContain('minRooms');
    expect(fieldsFromMessage).not.toContain('maxRent');
  });
});
