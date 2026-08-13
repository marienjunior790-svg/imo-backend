import {
  VISION_SYSTEM_PROMPT,
  buildVisionMetierActions,
  buildVisionMetierAppendix,
  buildVisionUserPrompt,
  classifyVisionReading,
  resolveVisionUnitHint,
} from '../../src/modules/ai/ai.vision.js';

describe('ai.vision (Phase J3)', () => {
  it('expose un system prompt métier dégât / document', () => {
    expect(VISION_SYSTEM_PROMPT).toMatch(/dégât|fuite/i);
    expect(VISION_SYSTEM_PROMPT).toMatch(/maintenance/i);
    expect(VISION_SYSTEM_PROMPT).toMatch(/N’invente|N'invente/i);
  });

  it('classifie une fuite comme DAMAGE avec priorité', () => {
    const c = classifyVisionReading(
      'On voit une fuite d’eau sous l’évier et de l’humidité au sol.',
      'photo cuisine Appt 3B',
    );
    expect(c.kind).toBe('DAMAGE');
    expect(c.damageSignals.length).toBeGreaterThan(0);
    expect(c.priorityHint).toBeTruthy();
  });

  it('classifie CNI / passeport comme IDENTITY', () => {
    const c = classifyVisionReading('Recto CNI lisible, nom et date de naissance.', 'scan pièce identité');
    expect(c.kind).toBe('IDENTITY');
  });

  it('classifie un reçu / contrat comme DOCUMENT', () => {
    const c = classifyVisionReading('Photo d’un reçu de loyer signé.', 'document reçu');
    expect(c.kind).toBe('DOCUMENT');
    expect(c.looksLikeDocument).toBe(true);
  });

  it('ajoute un plan maintenance pour un dégât', () => {
    const c = classifyVisionReading('Fissure au plafond, risque d’aggravation.', 'urgent');
    const appendix = buildVisionMetierAppendix(c, {
      apartmentLabel: 'Appt 3B',
      buildingName: 'Immeuble Nord',
      tenantName: 'Jean Dupont',
      source: 'prompt_match',
    });
    expect(appendix).toMatch(/Plan d’action ITC|Maintenance/i);
    expect(appendix).toMatch(/Appt 3B/);
    expect(appendix).toMatch(/Priorité/i);
  });

  it('propose des actions Maintenance pour un dégât', () => {
    const c = classifyVisionReading('Fuite canalisation.', '');
    const actions = buildVisionMetierActions(c);
    expect(actions.some((a) => a.route === '/maintenance')).toBe(true);
    expect(actions.some((a) => a.route === '/properties')).toBe(true);
  });

  it('résout le logement depuis la session sans inventer', () => {
    const hint = resolveVisionUnitHint({
      session: { lastApartmentId: 'apt-1', lastLeaseId: 'lease-1', lastTenantName: 'Awa' },
      apartments: [{ id: 'apt-1', label: 'Studio A', buildingName: 'Tour 1' }],
      leases: [
        {
          id: 'lease-1',
          apartmentId: 'apt-1',
          tenantName: 'Awa K.',
          status: 'ACTIVE',
        },
      ],
    });
    expect(hint.source).toBe('session');
    expect(hint.apartmentId).toBe('apt-1');
    expect(hint.apartmentLabel).toBe('Studio A');
    expect(hint.leaseId).toBe('lease-1');
  });

  it('résout le logement par libellé unique dans le prompt', () => {
    const hint = resolveVisionUnitHint({
      userPrompt: 'fuite dans Appt 3B',
      reading: 'humidité visible',
      apartments: [
        { id: 'a1', label: 'Appt 3B', buildingName: 'Nord' },
        { id: 'a2', label: 'Appt 1A', buildingName: 'Sud' },
      ],
      leases: [
        { id: 'l1', apartmentId: 'a1', tenantName: 'Fortune', status: 'ACTIVE' },
      ],
    });
    expect(hint.source).toBe('prompt_match');
    expect(hint.apartmentId).toBe('a1');
    expect(hint.tenantName).toBe('Fortune');
  });

  it('ne force pas un logement ambigu', () => {
    const hint = resolveVisionUnitHint({
      userPrompt: 'photo',
      apartments: [
        { id: 'a1', label: 'A', buildingName: null },
        { id: 'a2', label: 'B', buildingName: null },
      ],
    });
    expect(hint.source).toBe('none');
    expect(hint.apartmentId).toBeUndefined();
  });

  it('construit un prompt user avec consignes dégât', () => {
    const p = buildVisionUserPrompt('fuite évier', '{"units":1}');
    expect(p).toMatch(/fuite évier/);
    expect(p).toMatch(/ticket maintenance/i);
    expect(p).toMatch(/\{"units":1\}/);
  });
});
