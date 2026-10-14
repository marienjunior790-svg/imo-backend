import {
  LEASE_DRAFT_MARKER,
  collectLeaseDraftMessages,
  hasLeaseCreateCue,
  hasLeaseMakeCue,
  hasLeasePdfCue,
  matchApartmentsInText,
  matchTenantsInText,
  mentionsContract,
  mergeLeaseFields,
  parseLeaseFields,
  resolveLeaseDates,
} from '../../src/modules/ai/ai.lease-request.js';

const today = new Date(2026, 9, 15);

describe('ai.lease-request — champs', () => {
  it('dates, durée, loyer, caution', () => {
    const f = parseLeaseFields(
      'Crée un contrat pour Jean au logement A2 à partir du 1er novembre pour 1 an, loyer 150 000 FCFA, caution 2 mois',
      today,
    );
    expect(f.startDate).toBe('2026-11-01');
    expect(f.durationMonths).toBe(12);
    expect(f.monthlyRent).toBe(150000);
    expect(f.depositMonths).toBe(2);
    expect(resolveLeaseDates(f, today).endDate).toBe('2027-10-31');
  });

  it('période explicite du … au …', () => {
    const f = parseLeaseFields('bail du 01/12/2026 au 30/11/2027', today);
    expect(f.startDate).toBe('2026-12-01');
    expect(f.endDate).toBe('2027-11-30');
  });

  it('formes courtes', () => {
    expect(parseLeaseFields('pour 6 mois', today).durationMonths).toBe(6);
    expect(parseLeaseFields('deux ans', today).durationMonths).toBe(24);
    expect(parseLeaseFields('loyer 120k', today).monthlyRent).toBe(120000);
    expect(parseLeaseFields('caution de 300 000', today).depositAmount).toBe(300000);
    expect(parseLeaseFields('2 mois de caution', today)).toEqual({ depositMonths: 2 });
    expect(parseLeaseFields('à partir du mois prochain', today).startDate).toBe('2026-11-01');
    expect(parseLeaseFields('début janvier', today).startDate).toBe('2027-01-01');
    expect(parseLeaseFields('Et active-le', today).activate).toBe(true);
    expect(parseLeaseFields('en brouillon', today).activate).toBe(false);
  });

  it('valeurs par défaut : aujourd’hui + 12 mois', () => {
    const d = resolveLeaseDates({}, today);
    expect(d).toEqual({ startDate: '2026-10-15', endDate: '2027-10-14', startDefaulted: true, endDefaulted: true });
  });

  it('les corrections récentes priment', () => {
    const merged = mergeLeaseFields([
      parseLeaseFields('pour 1 an, caution 2 mois', today),
      parseLeaseFields('plutôt 6 mois', today),
      parseLeaseFields('caution 100 000', today),
    ]);
    expect(merged.durationMonths).toBe(6);
    expect(merged.depositAmount).toBe(100000);
    expect(merged.depositMonths).toBeUndefined();
  });
});

describe('ai.lease-request — intentions', () => {
  it.each([
    ['Crée un contrat pour Jean Mbemba', true, false],
    ['Nouveau bail pour Marie', true, false],
    ['Génère le contrat PDF de Jean', false, true],
    ['Ouvre les contrats', false, false],
    ['Quels contrats arrivent à échéance ?', false, false],
  ])('%s', (msg, create, pdf) => {
    expect(mentionsContract(msg)).toBe(true);
    expect(hasLeaseCreateCue(msg)).toBe(create);
    expect(hasLeasePdfCue(msg)).toBe(pdf);
  });

  it('verbe neutre', () => {
    expect(hasLeaseMakeCue('Fais un contrat pour Paul')).toBe(true);
    expect(hasLeaseMakeCue('Prépare le bail de Paul')).toBe(true);
  });
});

describe('ai.lease-request — correspondances', () => {
  const tenants = [
    { id: 't1', firstName: 'Jean', lastName: 'Mbemba' },
    { id: 't2', firstName: 'Jean', lastName: 'Okemba' },
    { id: 't3', firstName: 'Fortuné', lastName: 'Libolo' },
  ];
  const units = [
    { id: 'a1', label: 'A2', buildingName: 'Résidence Soleil' },
    { id: 'a2', label: 'Appt 3', buildingName: null },
    { id: 'a3', label: '12', buildingName: null },
  ];

  it('locataire par nom complet, prénom ambigu, nom sans accent', () => {
    expect(matchTenantsInText('contrat pour Jean Mbemba', tenants).map((t) => t.id)).toEqual(['t1']);
    expect(matchTenantsInText('contrat pour Jean', tenants).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(matchTenantsInText('fortune libolo', tenants).map((t) => t.id)).toEqual(['t3']);
    expect(matchTenantsInText('contrat pour 1 an', tenants)).toEqual([]);
  });

  it('logement par libellé', () => {
    expect(matchApartmentsInText('au logement A2', units).map((u) => u.id)).toEqual(['a1']);
    expect(matchApartmentsInText('A2', units).map((u) => u.id)).toEqual(['a1']);
    expect(matchApartmentsInText('dans l appt 3', units).map((u) => u.id)).toEqual(['a2']);
    expect(matchApartmentsInText('appartement n°12', units).map((u) => u.id)).toEqual(['a3']);
    expect(matchApartmentsInText('pour 12 mois', units)).toEqual([]);
    expect(matchApartmentsInText('à partir du 1er novembre', units)).toEqual([]);
  });
});

describe('ai.lease-request — brouillon multi-tours', () => {
  it('rassemble les réponses tant que l’assistant pose des questions de contrat', () => {
    const history = [
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Bonjour !' },
      { role: 'user', content: 'Crée un contrat pour Jean' },
      { role: 'assistant', content: `${LEASE_DRAFT_MARKER} — plusieurs locataires correspondent` },
      { role: 'user', content: 'Jean Mbemba' },
      { role: 'assistant', content: `${LEASE_DRAFT_MARKER} — quel logement ?` },
    ];
    expect(collectLeaseDraftMessages('Logement A2', history)).toEqual([
      'Crée un contrat pour Jean',
      'Jean Mbemba',
      'Logement A2',
    ]);
  });

  it('aucun brouillon si la dernière réponse n’en parle pas', () => {
    expect(collectLeaseDraftMessages('A2', [{ role: 'assistant', content: 'Bonjour !' }])).toEqual(['A2']);
  });
});
