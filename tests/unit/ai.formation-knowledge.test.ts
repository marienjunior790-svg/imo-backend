import {
  formatFormationHitsForPrompt,
  getFormationCorpus,
  isFormationKnowledgeQuestion,
  searchFormationKnowledge,
} from '../../src/modules/ai/ai.formation-knowledge.js';
import { AiToolsService } from '../../src/modules/ai/ai.tools.js';
import { formatToolResultForLocalReply } from '../../src/modules/ai/ai.tools.js';

describe('Formation knowledge corpus v1', () => {
  it('charge 6 fiches toutes unverified (pas production_ready)', () => {
    const corpus = getFormationCorpus();
    expect(corpus.cards).toHaveLength(6);
    expect(corpus.manifest.counts.verified).toBe(0);
    expect(corpus.cards.every((c) => c.verificationStatus === 'unverified')).toBe(true);
    expect(corpus.cards.every((c) => c.corpusRole !== 'production_ready')).toBe(true);
  });

  it('retrouve le rendement brut sans inventer de transcript', () => {
    const r = searchFormationKnowledge('Comment calculer le rendement brut ?');
    expect(r.count).toBeGreaterThan(0);
    expect(r.hits[0]?.cardId).toBe('KC-IMM-002');
    expect(r.hits[0]?.formulas?.[0]).toMatch(/Rendement Brut/i);
    expect(r.hits[0]?.verificationStatus).toBe('unverified');
    expect(r.note).toMatch(/unverified|secondaire/i);
  });

  it('signale l’absence pour un sujet hors corpus', () => {
    const r = searchFormationKnowledge('xyzzyplugh quasiparticule zonotope foobar');
    expect(r.count).toBe(0);
    expect(r.note).toMatch(/Aucun passage/i);
  });

  it('détecte les intents formation vs salut', () => {
    expect(isFormationKnowledgeQuestion('Explique le rendement brut')).toBe(true);
    expect(isFormationKnowledgeQuestion('Bonjour')).toBe(false);
  });

  it('exemple rendement 7,5 % est arithmétiquement cohérent', () => {
    const card = getFormationCorpus().cards.find((c) => c.id === 'KC-IMM-002');
    const ex = card?.examples.find((e) => e.verifiable);
    expect(ex?.inputs).toMatchObject({
      loyerAnnuelHorsCharges: 7500,
      prixAcquisitionTotal: 100000,
    });
    const pct =
      (Number(ex!.inputs!.loyerAnnuelHorsCharges) / Number(ex!.inputs!.prixAcquisitionTotal)) * 100;
    expect(pct).toBe(7.5);
    expect(ex?.expectedOutput).toMatchObject({ rendementBrutPct: 7.5 });
  });

  it('format prompt expose la provenance', () => {
    const text = formatFormationHitsForPrompt(searchFormationKnowledge('épargne 10%'));
    expect(text).toContain('KC-IMM-001');
    expect(text).toContain('unverified');
    expect(text).toContain('SECONDAIRE');
  });
});

describe('Formation knowledge — outil AiToolsService', () => {
  it('mappe intent local + execute sans utiliser organizationId métier', async () => {
    const tools = Object.create(AiToolsService.prototype) as AiToolsService;
    const intents = tools.resolveLocalToolIntents('Comment calculer le rendement brut locatif ?');
    expect(intents.map((i) => i.name)).toContain('searchFormationKnowledge');

    const svc = new AiToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = (await svc.execute('org-any', 'searchFormationKnowledge', {
      query: 'rendement brut',
      organizationId: 'evil-org',
    })) as { count: number; hits: Array<{ cardId: string }> };
    expect(result.count).toBeGreaterThan(0);
    expect(result.hits[0]?.cardId).toBe('KC-IMM-002');

    const formatted = formatToolResultForLocalReply('searchFormationKnowledge', result);
    expect(formatted).toContain('Savoir formation');
    expect(formatted).toContain('KC-IMM-002');
  });

  it('ne force pas searchFormation pour une question portefeuille vacants', () => {
    const tools = Object.create(AiToolsService.prototype) as AiToolsService;
    const names = tools.resolveLocalToolIntents('Combien de logements vacants ?').map((i) => i.name);
    expect(names).toContain('getVacantUnits');
    expect(names).not.toContain('searchFormationKnowledge');
  });
});
