import {
  actionsFromTools,
  buildLocalFallbackReply,
  resolveChatActions,
} from '../../src/modules/ai/ai.fallback.js';
import type { AiOrganizationContext } from '../../src/modules/ai/ai.context.service.js';

const mockContext: AiOrganizationContext = {
  organization: { id: 'org-1', name: 'Agence Test', city: 'Brazzaville', plan: 'PRO' },
  summary: {
    totalBuildings: 1,
    totalApartments: 5,
    availableApartments: 2,
    occupiedApartments: 3,
    activeLeases: 3,
    totalTenants: 3,
    latePayments: 1,
    pendingPayments: 2,
    collectedThisMonthXaf: 450000,
    potentialMonthlyRentXaf: 800000,
    occupancyRate: 60,
  },
  buildings: [{ name: 'Immeuble A', apartmentCount: 5, occupiedCount: 3, potentialRentXaf: 800000 }],
  latePayments: [
    {
      tenantName: 'Grace Tair',
      apartmentLabel: 'Appt 2A',
      amountXaf: 150000,
      dueDate: '2025-03-05',
      period: '3/2025',
    },
  ],
  availableApartments: [{ label: 'Studio RDC', rentXaf: 80000 }],
  expiringLeases: [],
};

describe('AI local fallback', () => {
  it('répond aux questions sur les retards', () => {
    const reply = buildLocalFallbackReply('Quels loyers sont en retard ?', mockContext);
    expect(reply).toContain('Grace Tair');
    expect(reply).toContain('150');
  });

  it('répond aux questions sur les encaissements', () => {
    const reply = buildLocalFallbackReply('Combien encaissé ce mois ?', mockContext);
    expect(reply).toContain('450');
    expect(reply).toContain('XAF');
  });

  it('répond aux biens disponibles', () => {
    const reply = buildLocalFallbackReply('Appartements disponibles', mockContext);
    expect(reply).toContain('Studio RDC');
  });

  it('salue et présente le copilote (pas un dump froid)', () => {
    const reply = buildLocalFallbackReply('Bonjour', mockContext);
    expect(reply.toLowerCase()).toContain('bonjour');
    expect(reply).toContain('Agence Test');
    expect(reply).toMatch(/impay|vacant|patrimoine|contrat/i);
  });

  it('répond à « mes logements » avec le parc réel (jamais « pas compris »)', () => {
    const reply = buildLocalFallbackReply('mes logements', mockContext);
    expect(reply.toLowerCase()).not.toMatch(/pas reconnu|pas compris|demande précise/);
    expect(reply).toContain('5');
    expect(reply).toMatch(/logement|occup/i);
  });

  it('question floue : données réelles sans « pas reconnu »', () => {
    const reply = buildLocalFallbackReply('xyz abc', mockContext);
    expect(reply.toLowerCase()).not.toMatch(/pas reconnu|pas compris/);
    expect(reply).toContain('Agence Test');
  });
});

describe('resolveChatActions', () => {
  it('propose navigation logements', () => {
    const actions = resolveChatActions('mes logements');
    expect(actions.some((a) => a.route === '/properties')).toBe(true);
  });

  it('propose navigation impayés avec query', () => {
    const actions = resolveChatActions('qui n’a pas payé ce mois-ci ?');
    expect(actions.some((a) => a.route === '/payments?tab=unpaid')).toBe(true);
  });
});

describe('actionsFromTools', () => {
  it('mappe getUnits vers propriétés', () => {
    const actions = actionsFromTools(['getUnits']);
    expect(actions.some((a) => a.route === '/properties')).toBe(true);
  });

  it('mappe getOutstandingPayments vers onglet impayés', () => {
    const actions = actionsFromTools(['getOutstandingPayments']);
    expect(actions.some((a) => a.route === '/payments?tab=unpaid')).toBe(true);
  });
});
