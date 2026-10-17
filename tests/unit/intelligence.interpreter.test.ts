import { interpretDemandText, mergeDemandWithText } from '../../src/modules/intelligence/demand-interpreter';
import { goldB2Corpus } from '../../src/modules/intelligence/gold/b2-weighted';
import { INTERPRETER_VERSION } from '../../src/modules/intelligence/interpreter-version';
import { runMatchEngine } from '../../src/modules/intelligence/matching.engine';

describe('Core Intelligence CI-4 — DemandInterpreter', () => {
  it('version interpréteur', () => {
    expect(INTERPRETER_VERSION).toBe('0.1.0');
  });

  it('extrait budget, pièces, quartier (sans inventer)', () => {
    const r = interpretDemandText('Je cherche 2 pièces à Poto-Poto, max 180000 FCFA');
    expect(r.incomplete).toBe(false);
    expect(r.parsed.maxRent).toBe(180_000);
    expect(r.parsed.minRooms).toBe(2);
    expect(r.parsed.districts).toContain('Poto-Poto');
    expect(r.parsed.cities).toContain('Brazzaville');
    expect(r.fieldsFromText).toEqual(expect.arrayContaining(['maxRent', 'minRooms', 'districts']));
    expect(r.clarifications).toEqual([]);
  });

  it('reconnaît studio, F3, 150k', () => {
    const r = interpretDemandText('studio a brazza budget 150k');
    expect(r.parsed.minRooms).toBe(1);
    expect(r.parsed.maxRent).toBe(150_000);
    expect(r.parsed.cities).toContain('Brazzaville');
  });

  it('B3: demande incomplète → partial + clarifications, zéro critère inventé', () => {
    const r = interpretDemandText('je cherche un logement sympa');
    expect(r.incomplete).toBe(true);
    expect(r.parsed.maxRent).toBeUndefined();
    expect(r.parsed.cities).toBeUndefined();
    expect(r.parsed.districts).toBeUndefined();
    expect(r.clarifications.length).toBeGreaterThan(0);

    const { demand, interpretation } = mergeDemandWithText({ text: 'je cherche un logement sympa' });
    expect(interpretation?.incomplete).toBe(true);

    const result = runMatchEngine(goldB2Corpus(), demand);
    expect(result.demand.partial).toBe(true);
    expect(result.interpretation?.incomplete).toBe(true);
    expect(result.suggestions?.length).toBeGreaterThan(0);
    // Pas de filtre inventé : tous les AVAILABLE publiés du corpus restent éligibles
    expect(result.eligibleCount).toBe(goldB2Corpus().length);
  });

  it('les champs explicites écrasent le texte', () => {
    const { demand } = mergeDemandWithText({
      text: '2 pièces à Moungali max 200000',
      maxRent: 120_000,
      districts: ['Bacongo'],
    });
    expect(demand.maxRent).toBe(120_000);
    expect(demand.districts).toEqual(['Bacongo']);
    expect(demand.minRooms).toBe(2);
  });

  it('n’invente pas une ville absente du texte', () => {
    const r = interpretDemandText('appartement 3 pièces max 250000 fcfa');
    expect(r.parsed.cities).toBeUndefined();
    expect(r.parsed.minRooms).toBe(3);
    expect(r.parsed.maxRent).toBe(250_000);
    expect(r.clarifications.some((c) => /ville|quartier/i.test(c))).toBe(true);
  });

  it('texte complet alimente le matching gold Poto-Poto', () => {
    const result = runMatchEngine(goldB2Corpus(), {
      text: '2 pieces poto-poto budget maximum 180000 FCFA',
    });
    const ids = result.matches.map((m) => m.listing.id);
    expect(ids[0]).toBe('g-pot-160');
    expect(ids).not.toContain('g-mou-140');
    expect(result.interpretation?.interpreterVersion).toBe(INTERPRETER_VERSION);
  });
});
