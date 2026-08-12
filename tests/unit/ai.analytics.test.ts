import {
  occupancyRatePct,
  remainingXaf,
  revenueDelta,
  utcLastMonth,
  utcThisMonth,
} from '../../src/modules/ai/ai.analytics.math.js';
import { AiAnalyticsService } from '../../src/modules/ai/ai.analytics.service.js';
import { AiToolsService, formatToolResultForLocalReply } from '../../src/modules/ai/ai.tools.js';

function mockPrisma(overrides: Record<string, unknown> = {}) {
  const payment = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const apartment = {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const building = { count: jest.fn().mockResolvedValue(0) };
  const tenant = { count: jest.fn().mockResolvedValue(0) };
  const lease = {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const maintenanceTicket = { findMany: jest.fn().mockResolvedValue([]) };
  return {
    payment: { ...payment, ...(overrides.payment as object) },
    apartment: { ...apartment, ...(overrides.apartment as object) },
    building: { ...building, ...(overrides.building as object) },
    tenant: { ...tenant, ...(overrides.tenant as object) },
    lease: { ...lease, ...(overrides.lease as object) },
    maintenanceTicket: {
      ...maintenanceTicket,
      ...(overrides.maintenanceTicket as object),
    },
  };
}

describe('ai.analytics.math', () => {
  it('occupancyRate = occupied/units * 100 (1 decimal)', () => {
    expect(occupancyRatePct(1, 3)).toBe(33.3);
    expect(occupancyRatePct(2, 4)).toBe(50);
    expect(occupancyRatePct(0, 0)).toBe(0);
    expect(Number.isNaN(occupancyRatePct(0, 0))).toBe(false);
  });

  it('revenueDelta math + null pct when A=0', () => {
    expect(revenueDelta(100_000, 120_000)).toEqual({
      deltaXaf: 20_000,
      deltaPct: 20,
      direction: 'up',
    });
    expect(revenueDelta(200_000, 100_000)).toEqual({
      deltaXaf: -100_000,
      deltaPct: -50,
      direction: 'down',
    });
    expect(revenueDelta(0, 50_000)).toEqual({
      deltaXaf: 50_000,
      deltaPct: null,
      direction: 'up',
    });
    expect(revenueDelta(10, 10).direction).toBe('flat');
  });

  it('remaining never negative', () => {
    expect(remainingXaf(100, 40)).toBe(60);
    expect(remainingXaf(100, 150)).toBe(0);
  });

  it('utc period helpers', () => {
    const now = new Date(Date.UTC(2026, 7, 13)); // Aug 13 2026
    expect(utcThisMonth(now)).toEqual({ month: 8, year: 2026 });
    expect(utcLastMonth(now)).toEqual({ month: 7, year: 2026 });
  });
});

describe('AiAnalyticsService (mocked Prisma)', () => {
  it('portfolioSnapshot occupancy exact + empty org zeros', async () => {
    const prisma = mockPrisma({
      building: { count: jest.fn().mockResolvedValue(0) },
      apartment: {
        count: jest
          .fn()
          .mockResolvedValueOnce(0) // units
          .mockResolvedValueOnce(0) // occupied
          .mockResolvedValueOnce(0), // vacant
        findMany: jest.fn().mockResolvedValue([]),
      },
      tenant: { count: jest.fn().mockResolvedValue(0) },
      lease: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    });
    const svc = new AiAnalyticsService(prisma as never);
    const snap = await svc.portfolioSnapshot('org-empty');
    expect(snap.unitsCount).toBe(0);
    expect(snap.occupancyRate).toBe(0);
    expect(snap.outstandingTotalXaf).toBe(0);
    expect(snap.collectedThisMonthXaf).toBe(0);
    expect(snap.currency).toBe('XAF');
    expect(Number.isNaN(snap.occupancyRate)).toBe(false);
  });

  it('portfolioSnapshot occupancyRate = occupied/units * 100', async () => {
    const prisma = mockPrisma({
      building: { count: jest.fn().mockResolvedValue(2) },
      apartment: {
        count: jest
          .fn()
          .mockResolvedValueOnce(4) // units
          .mockResolvedValueOnce(3) // occupied
          .mockResolvedValueOnce(1), // vacant
      },
      tenant: { count: jest.fn().mockResolvedValue(3) },
      lease: {
        count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0),
      },
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { amount: 100_000, amountPaid: 0 },
            { amount: 50_000, amountPaid: 10_000 },
          ])
          .mockResolvedValueOnce([{ amountPaid: 200_000 }]),
      },
    });
    const svc = new AiAnalyticsService(prisma as never);
    const snap = await svc.portfolioSnapshot('org-1');
    expect(snap.occupancyRate).toBe(75);
    expect(snap.outstandingCount).toBe(2);
    expect(snap.outstandingTotalXaf).toBe(140_000);
    expect(snap.collectedThisMonthXaf).toBe(200_000);
  });

  it('compareRevenue delta math', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ amountPaid: 100_000 }, { amountPaid: 50_000 }]) // period A
      .mockResolvedValueOnce([{ amountPaid: 80_000 }]); // period B
    const prisma = mockPrisma({ payment: { findMany, count: jest.fn() } });
    const svc = new AiAnalyticsService(prisma as never);
    const cmp = await svc.compareRevenuePeriods(
      'org-1',
      { month: 7, year: 2026 },
      { month: 8, year: 2026 },
    );
    expect(cmp.revenueA).toBe(150_000);
    expect(cmp.revenueB).toBe(80_000);
    expect(cmp.deltaXaf).toBe(-70_000);
    expect(cmp.deltaPct).toBe(-46.7);
    expect(cmp.direction).toBe('down');
  });

  it('buildingsOutstandingRanking orders by outstandingTotalXaf desc', async () => {
    const prisma = mockPrisma({
      payment: {
        findMany: jest.fn().mockResolvedValue([
          {
            amount: 100_000,
            amountPaid: 0,
            lease: {
              tenantId: 't1',
              apartment: {
                buildingId: 'b-low',
                building: { id: 'b-low', name: 'Bas' },
              },
            },
          },
          {
            amount: 300_000,
            amountPaid: 50_000,
            lease: {
              tenantId: 't2',
              apartment: {
                buildingId: 'b-high',
                building: { id: 'b-high', name: 'Haut' },
              },
            },
          },
          {
            amount: 200_000,
            amountPaid: 0,
            lease: {
              tenantId: 't3',
              apartment: {
                buildingId: 'b-high',
                building: { id: 'b-high', name: 'Haut' },
              },
            },
          },
        ]),
      },
    });
    const svc = new AiAnalyticsService(prisma as never);
    const rank = await svc.buildingsOutstandingRanking('org-1', 5);
    expect(rank.items[0]?.buildingName).toBe('Haut');
    expect(rank.items[0]?.outstandingTotalXaf).toBe(450_000);
    expect(rank.items[0]?.outstandingCount).toBe(2);
    expect(rank.items[0]?.tenantCountAffected).toBe(2);
    expect(rank.items[1]?.buildingName).toBe('Bas');
    expect(rank.items[1]?.outstandingTotalXaf).toBe(100_000);
  });

  it('revenueDropExplanation sufficient:false on empty org', async () => {
    const prisma = mockPrisma();
    const svc = new AiAnalyticsService(prisma as never);
    const expl = await svc.revenueDropExplanation('org-empty');
    expect(expl.sufficient).toBe(false);
    if (!expl.sufficient) {
      expect(expl.reason).toMatch(/insuffisant/i);
    }
  });
});

describe('Phase F local intents', () => {
  const tools = Object.create(AiToolsService.prototype) as AiToolsService;

  it('situation de mon parc → analyzePortfolio', () => {
    const intents = tools.resolveLocalToolIntents('Quelle est la situation de mon parc ?');
    expect(intents.map((i) => i.name)).toContain('analyzePortfolio');
  });

  it('résumer mon patrimoine → analyzePortfolio', () => {
    const intents = tools.resolveLocalToolIntents('Résumer mon patrimoine');
    expect(intents.map((i) => i.name)).toContain('analyzePortfolio');
    expect(intents.map((i) => i.name)).not.toContain('getDashboardSummary');
  });

  it('quel immeuble + impayé → rankBuildingsByOutstanding', () => {
    const intents = tools.resolveLocalToolIntents('Quel immeuble a le plus d’impayés ?');
    expect(intents.map((i) => i.name)).toContain('rankBuildingsByOutstanding');
    expect(intents.map((i) => i.name)).not.toContain('getBuildings');
  });

  it('compare revenus → compareRevenue', () => {
    const intents = tools.resolveLocalToolIntents('Compare les revenus de ce mois et du mois dernier');
    expect(intents.map((i) => i.name)).toContain('compareRevenue');
    expect(intents.map((i) => i.name)).not.toContain('getFinancialSummary');
  });

  it('pourquoi baisse → explainRevenueChange', () => {
    const intents = tools.resolveLocalToolIntents('Pourquoi mes revenus ont baissé ?');
    expect(intents.map((i) => i.name)).toContain('explainRevenueChange');
  });

  it('problèmes urgents → listUrgentIssues', () => {
    const intents = tools.resolveLocalToolIntents('Quels sont les 5 problèmes les plus urgents ?');
    expect(intents.map((i) => i.name)).toContain('listUrgentIssues');
  });
});

describe('formatToolResultForLocalReply — analytics', () => {
  it('formate compareRevenue avec chiffres', () => {
    const text = formatToolResultForLocalReply('compareRevenue', {
      periodA: { month: 7, year: 2026 },
      periodB: { month: 8, year: 2026 },
      revenueA: 150000,
      revenueB: 80000,
      deltaXaf: -70000,
      deltaPct: -46.7,
      direction: 'down',
      currency: 'XAF',
    });
    expect(text).toContain('150');
    expect(text).toContain('80');
    expect(text).toContain('baisse');
  });

  it('formate explainRevenueChange insufficient', () => {
    const text = formatToolResultForLocalReply('explainRevenueChange', {
      sufficient: false,
      reason: 'Données insuffisantes',
      asOf: '2026-08-13T00:00:00.000Z',
    });
    expect(text.toLowerCase()).toMatch(/insuffisant/);
  });
});
