import {
  DATA_FIRST_PROMPT,
  MISSING_DATA_MESSAGE,
  estimateVacancyMonthlyImpact,
  formatDataAccessError,
  formatDataFirstReply,
  isGeneralKnowledgeQuestion,
  isPortfolioDataQuestion,
  stripClientOrganizationIds,
} from '../../src/modules/ai/ai.data-first.js';
import { AiToolsService } from '../../src/modules/ai/ai.tools.js';
import { AiContextService } from '../../src/modules/ai/ai.context.service.js';
import { occupancyRatePct, remainingXaf, revenueDelta } from '../../src/modules/ai/ai.analytics.math.js';
import { buildLocalFallbackReply } from '../../src/modules/ai/ai.fallback.js';
import type { AiOrganizationContext } from '../../src/modules/ai/ai.context.service.js';
import { ApartmentStatus } from '@prisma/client';

function sampleCtx(overrides: Partial<AiOrganizationContext> = {}): AiOrganizationContext {
  const base: AiOrganizationContext = {
    organization: { id: 'orgA', name: 'Org Alpha', city: 'Brazzaville', plan: 'PRO_MAX' },
    summary: {
      totalBuildings: 2,
      totalApartments: 10,
      availableApartments: 2,
      occupiedApartments: 8,
      activeLeases: 8,
      totalTenants: 8,
      latePayments: 1,
      pendingPayments: 2,
      collectedThisMonthXaf: 400_000,
      potentialMonthlyRentXaf: 500_000,
      occupancyRate: 80,
    },
    buildings: [{ name: 'Rose', apartmentCount: 5, occupiedCount: 4, potentialRentXaf: 250_000 }],
    latePayments: [
      {
        tenantName: 'Jean',
        apartmentLabel: 'A1',
        amountXaf: 50_000,
        dueDate: '2026-03-01',
        period: '03/2026',
      },
    ],
    availableApartments: [
      { label: 'B2', rentXaf: 80_000, buildingName: 'Rose' },
      { label: 'C1', rentXaf: 100_000, buildingName: 'Lys' },
    ],
    expiringLeases: [],
  };
  return {
    ...base,
    ...overrides,
    organization: { ...base.organization, ...(overrides.organization ?? {}) },
    summary: { ...base.summary, ...(overrides.summary ?? {}) },
    availableApartments: overrides.availableApartments ?? base.availableApartments,
  };
}

describe('Data-First User-Aware — détection d’intent', () => {
  it('détecte les questions portefeuille', () => {
    expect(isPortfolioDataQuestion('Combien de logements vacants ?')).toBe(true);
    expect(isPortfolioDataQuestion('Quels sont mes impayés ?')).toBe(true);
    expect(isPortfolioDataQuestion('Résumer mon patrimoine')).toBe(true);
    expect(isPortfolioDataQuestion('Taux d’occupation')).toBe(true);
  });

  it('laisse les questions générales hors portefeuille', () => {
    expect(isGeneralKnowledgeQuestion('Bonjour')).toBe(true);
    expect(isGeneralKnowledgeQuestion('Comment marche l’application ?')).toBe(true);
    expect(isPortfolioDataQuestion('Merci')).toBe(false);
  });

  it('expose la politique dans le prompt système', () => {
    expect(DATA_FIRST_PROMPT).toContain('Data-First');
    expect(DATA_FIRST_PROMPT).toContain(MISSING_DATA_MESSAGE);
    expect(DATA_FIRST_PROMPT).toContain('**Fait**');
  });
});

describe('Data-First — pas d’invention / structure', () => {
  it('n’estime pas sans loyers réels', () => {
    const r = estimateVacancyMonthlyImpact({ vacantCount: 3, sampleRentXaf: [] });
    expect(r.monthlyLossXaf).toBeNull();
    expect(r.limit).toMatch(/impossible/i);
  });

  it('calcule une estimation explicite à partir de loyers fournis', () => {
    const r = estimateVacancyMonthlyImpact({ vacantCount: 2, sampleRentXaf: [80_000, 100_000] });
    expect(r.averageRentXaf).toBe(90_000);
    expect(r.monthlyLossXaf).toBe(180_000);
    expect(r.hypothesis).toMatch(/Hypothèse/);
  });

  it('sépare fait / estimation dans le format de réponse', () => {
    const text = formatDataFirstReply({
      facts: ['2 vacants'],
      estimations: ['≈ 180 000 XAF/mois'],
      limits: ['Hypothèse loyer moyen'],
    });
    expect(text).toContain('**Fait**');
    expect(text).toContain('**Estimation**');
    expect(text).toContain('pas un fait');
  });

  it('signale une erreur d’accès sans inventer de KPI', () => {
    const msg = formatDataAccessError();
    expect(msg).toContain(MISSING_DATA_MESSAGE);
    expect(msg).not.toMatch(/XAF|occupation|vacant\(s\)/i);
  });

  it('structure la réponse vacants locale à partir du contexte org uniquement', () => {
    const reply = buildLocalFallbackReply('Quels logements sont vacants ?', sampleCtx());
    expect(reply).toContain('**Fait**');
    expect(reply).toContain('B2');
    expect(reply).toContain('**Estimation**');
    expect(reply).not.toMatch(/invent/i);
  });

  it('indique l’absence de vacants sans inventer de liste', () => {
    const reply = buildLocalFallbackReply(
      'logements vacants',
      sampleCtx({
        summary: {
          ...sampleCtx().summary,
          availableApartments: 0,
          occupiedApartments: 10,
          occupancyRate: 100,
        },
        availableApartments: [],
      }),
    );
    expect(reply).toContain('Aucun logement vacant');
    expect(reply).not.toContain('B2');
  });

  it('structure la réponse impayés locale (parité Data-First avec vacants)', () => {
    const reply = buildLocalFallbackReply('Quels sont mes impayés ?', sampleCtx());
    expect(reply).toContain('**Fait**');
    expect(reply).toContain('**Analyse**');
    expect(reply).toContain('**Recommandation**');
    expect(reply).toMatch(/impay|retard/i);
    expect(reply).not.toMatch(/invent/i);
  });

  it('indique l’absence d’impayés sans inventer de locataire', () => {
    const reply = buildLocalFallbackReply(
      'mes impayés',
      sampleCtx({
        summary: { ...sampleCtx().summary, latePayments: 0, pendingPayments: 1 },
        latePayments: [],
      }),
    );
    expect(reply).toContain('**Fait**');
    expect(reply).toContain('Aucun loyer en retard');
    expect(reply).not.toMatch(/Grace|Tair|150\s?000/i);
  });
});

describe('Data-First — formules financières vérifiables', () => {
  it('occupancyRatePct', () => {
    expect(occupancyRatePct(2, 3)).toBe(66.7);
    expect(occupancyRatePct(0, 0)).toBe(0);
  });

  it('remainingXaf et revenueDelta', () => {
    expect(remainingXaf(100_000, 40_000)).toBe(60_000);
    expect(remainingXaf(50_000, 80_000)).toBe(0);
    const d = revenueDelta(100, 120);
    expect(d.deltaXaf).toBe(20);
    expect(d.direction).toBe('up');
  });
});

describe('Data-First — isolation organisation (outils)', () => {
  function mockToolsPrisma(orgCounts: Record<string, number>) {
    return {
      apartment: {
        findMany: jest.fn(async ({ where }: { where: { organizationId: string; status?: string } }) => {
          const orgId = where.organizationId;
          const n = orgCounts[orgId] ?? 0;
          return Array.from({ length: n }, (_, i) => ({
            id: `${orgId}_u${i}`,
            label: `${orgId}-L${i}`,
            status: ApartmentStatus.AVAILABLE,
            rentAmount: 50_000 + i * 10_000,
            rooms: 2,
            surface: 40,
            floor: 0,
            building: { name: `Immeuble ${orgId}` },
          }));
        }),
        count: jest.fn(async ({ where }: { where: { organizationId: string } }) => orgCounts[where.organizationId] ?? 0),
      },
    };
  }

  it('deux organisations obtiennent des vacants distincts (scopés JWT/org)', async () => {
    const prisma = mockToolsPrisma({ orgA: 1, orgB: 3 });
    const contextService = {
      buildContext: jest.fn(),
      invalidateOrganization: jest.fn(),
    };
    const tools = new AiToolsService(
      prisma as never,
      contextService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const a = (await tools.execute('orgA', 'getVacantUnits', {})) as {
      count: number;
      items: Array<{ label: string }>;
    };
    const b = (await tools.execute('orgB', 'getVacantUnits', {})) as {
      count: number;
      items: Array<{ label: string }>;
    };

    expect(a.count).toBe(1);
    expect(b.count).toBe(3);
    expect(a.items[0]?.label).toContain('orgA');
    expect(b.items[0]?.label).toContain('orgB');
    expect(prisma.apartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'orgA' }) }),
    );
    expect(prisma.apartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'orgB' }) }),
    );
  });

  it('ignore organizationId injecté dans les args outil', async () => {
    const prisma = mockToolsPrisma({ jwtOrg: 2, evilOrg: 99 });
    const tools = new AiToolsService(
      prisma as never,
      { buildContext: jest.fn(), invalidateOrganization: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const args = { organizationId: 'evilOrg', orgId: 'evilOrg' };
    stripClientOrganizationIds(args);
    expect(args.organizationId).toBeUndefined();

    const result = (await tools.execute('jwtOrg', 'getVacantUnits', {
      organizationId: 'evilOrg',
      orgId: 'evilOrg',
    })) as { count: number };
    expect(result.count).toBe(2);
    expect(prisma.apartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'jwtOrg' }) }),
    );
  });

  it('retourne une erreur outil sans inventer de liste', async () => {
    const prisma = {
      apartment: {
        findMany: jest.fn(async () => {
          throw new Error('DB down');
        }),
      },
    };
    const tools = new AiToolsService(
      prisma as never,
      { buildContext: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = (await tools.execute('orgA', 'getVacantUnits', {})) as { error: string; code: number };
    expect(result.error).toMatch(/DB down/);
    expect(result.code).toBe(500);
    expect(result).not.toHaveProperty('items');
    expect(result).not.toHaveProperty('count');
  });
});

describe('Data-First — contexte org et invalidation cache', () => {
  it('reflète une modification après invalidateOrganization', async () => {
    let vacant = 1;
    const prisma = {
      organization: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          name: 'Org',
          city: 'BZV',
          plan: 'PRO_MAX',
        })),
      },
      building: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [{ name: 'R1', apartments: [] }]),
      },
      apartment: {
        count: jest.fn(async ({ where }: { where: { status?: string } }) => {
          if (where.status === ApartmentStatus.AVAILABLE) return vacant;
          if (where.status === ApartmentStatus.OCCUPIED) return 5;
          return 6;
        }),
        findMany: jest.fn(async ({ where }: { where: { status?: string; organizationId?: string } }) => {
          if (where.status === ApartmentStatus.AVAILABLE) {
            return Array.from({ length: vacant }, (_, i) => ({
              label: `V${i}`,
              rentAmount: 70_000,
              building: { name: 'R1' },
            }));
          }
          // allAptsRent
          return Array.from({ length: 6 }, () => ({ rentAmount: 70_000 }));
        }),
      },
      lease: { count: jest.fn(async () => 5), findMany: jest.fn(async () => []) },
      tenant: { count: jest.fn(async () => 5) },
      payment: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => []),
      },
    };

    const svc = new AiContextService(prisma as never);
    const first = await svc.buildContext('orgX');
    expect(first.summary.availableApartments).toBe(1);

    vacant = 4;
    const cached = await svc.buildContext('orgX');
    expect(cached.summary.availableApartments).toBe(1);

    svc.invalidateOrganization('orgX');
    const second = await svc.buildContext('orgX');
    expect(second.summary.availableApartments).toBe(4);
  });
});

describe('Data-First — intents locaux pour questions portefeuille', () => {
  const tools = Object.create(AiToolsService.prototype) as AiToolsService;

  it('mappe les questions portefeuille vers des outils réels', () => {
    expect(tools.resolveLocalToolIntents('Combien de logements vacants ?').map((i) => i.name)).toContain(
      'getVacantUnits',
    );
    expect(tools.resolveLocalToolIntents('mes impayés').map((i) => i.name)).toContain('getOutstandingPayments');
    expect(tools.resolveLocalToolIntents('résumer mon patrimoine').map((i) => i.name)).toContain('analyzePortfolio');
  });

  it('ne force pas d’outil data pour un salut général', () => {
    expect(tools.resolveLocalToolIntents('Bonjour').length).toBe(0);
  });
});
