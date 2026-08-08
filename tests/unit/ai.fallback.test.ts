import { buildLocalFallbackReply } from '../../src/modules/ai/ai.fallback.js';
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
});
