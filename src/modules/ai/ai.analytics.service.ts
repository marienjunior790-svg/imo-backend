import { inject, injectable } from 'tsyringe';
import {
  ApartmentStatus,
  LeaseStatus,
  MaintenancePriority,
  MaintenanceTicketStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import {
  occupancyRatePct,
  periodLabel,
  remainingXaf,
  revenueDelta,
  utcLastMonth,
  utcMonthBounds,
  utcThisMonth,
  type CalendarPeriod,
  type RevenueDirection,
} from './ai.analytics.math.js';

export type PortfolioSnapshot = {
  asOf: string;
  currency: 'XAF';
  buildingsCount: number;
  unitsCount: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  tenantsCount: number;
  activeLeasesCount: number;
  draftLeasesCount: number;
  outstandingCount: number;
  outstandingTotalXaf: number;
  collectedThisMonthXaf: number;
};

export type RevenuePeriodCompare = {
  periodA: CalendarPeriod;
  periodB: CalendarPeriod;
  revenueA: number;
  revenueB: number;
  deltaXaf: number;
  deltaPct: number | null;
  direction: RevenueDirection;
  currency: 'XAF';
};

export type BuildingOutstandingRankItem = {
  buildingId: string;
  buildingName: string;
  outstandingCount: number;
  outstandingTotalXaf: number;
  tenantCountAffected: number;
};

export type RevenueDropFactor = {
  key: string;
  label: string;
  thisMonth: number;
  lastMonth: number;
  delta: number;
};

export type RevenueDropExplanation =
  | {
      sufficient: true;
      asOf: string;
      currency: 'XAF';
      thisMonth: CalendarPeriod;
      lastMonth: CalendarPeriod;
      collectedThisMonthXaf: number;
      collectedLastMonthXaf: number;
      deltaXaf: number;
      deltaPct: number | null;
      direction: RevenueDirection;
      factors: RevenueDropFactor[];
    }
  | { sufficient: false; reason: string; asOf: string };

export type UrgentIssue = {
  type: string;
  label: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  score: number;
  why: string;
  entityIds: Record<string, string | undefined>;
};

export type PortfolioSynthesis = {
  asOf: string;
  currency: 'XAF';
  snapshot: PortfolioSnapshot;
  topBuildingsOutstanding: BuildingOutstandingRankItem[];
  topUrgentIssues: UrgentIssue[];
  periodCompare: RevenuePeriodCompare;
  dataSources: string[];
};

@injectable()
export class AiAnalyticsService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async portfolioSnapshot(organizationId: string, now: Date = new Date()): Promise<PortfolioSnapshot> {
    const period = utcThisMonth(now);
    const { start, endExclusive } = utcMonthBounds(period);

    const [
      buildingsCount,
      unitsCount,
      occupiedUnits,
      vacantUnits,
      tenantsCount,
      activeLeasesCount,
      draftLeasesCount,
      outstandingRows,
      collectedRows,
    ] = await Promise.all([
      this.prisma.building.count({ where: { organizationId } }),
      this.prisma.apartment.count({ where: { organizationId } }),
      this.prisma.apartment.count({
        where: { organizationId, status: ApartmentStatus.OCCUPIED },
      }),
      this.prisma.apartment.count({
        where: { organizationId, status: ApartmentStatus.AVAILABLE },
      }),
      this.prisma.tenant.count({ where: { organizationId } }),
      this.prisma.lease.count({ where: { organizationId, status: LeaseStatus.ACTIVE } }),
      this.prisma.lease.count({ where: { organizationId, status: LeaseStatus.DRAFT } }),
      this.prisma.payment.findMany({
        where: {
          organizationId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
        },
        select: { amount: true, amountPaid: true },
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId,
          status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] },
          OR: [
            { periodMonth: period.month, periodYear: period.year },
            { paidAt: { gte: start, lt: endExclusive } },
          ],
        },
        select: { amountPaid: true },
      }),
    ]);

    let outstandingTotalXaf = 0;
    for (const p of outstandingRows) {
      outstandingTotalXaf += remainingXaf(decimalToNumber(p.amount), decimalToNumber(p.amountPaid));
    }

    const collectedThisMonthXaf = collectedRows.reduce(
      (sum, p) => sum + decimalToNumber(p.amountPaid),
      0,
    );

    return {
      asOf: now.toISOString(),
      currency: 'XAF',
      buildingsCount,
      unitsCount,
      occupiedUnits,
      vacantUnits,
      occupancyRate: occupancyRatePct(occupiedUnits, unitsCount),
      tenantsCount,
      activeLeasesCount,
      draftLeasesCount,
      outstandingCount: outstandingRows.length,
      outstandingTotalXaf,
      collectedThisMonthXaf,
    };
  }

  async compareRevenuePeriods(
    organizationId: string,
    periodA: CalendarPeriod = utcLastMonth(),
    periodB: CalendarPeriod = utcThisMonth(),
  ): Promise<RevenuePeriodCompare> {
    const [revenueA, revenueB] = await Promise.all([
      this.sumCollectedForPeriod(organizationId, periodA),
      this.sumCollectedForPeriod(organizationId, periodB),
    ]);
    const delta = revenueDelta(revenueA, revenueB);
    return {
      periodA,
      periodB,
      revenueA,
      revenueB,
      ...delta,
      currency: 'XAF',
    };
  }

  async buildingsOutstandingRanking(
    organizationId: string,
    limit = 5,
  ): Promise<{ asOf: string; currency: 'XAF'; limit: number; items: BuildingOutstandingRankItem[] }> {
    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
      },
      select: {
        amount: true,
        amountPaid: true,
        lease: {
          select: {
            tenantId: true,
            apartment: {
              select: {
                buildingId: true,
                building: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const byBuilding = new Map<
      string,
      {
        buildingId: string;
        buildingName: string;
        outstandingCount: number;
        outstandingTotalXaf: number;
        tenants: Set<string>;
      }
    >();

    for (const p of rows) {
      const building = p.lease.apartment.building;
      const buildingId = building?.id ?? p.lease.apartment.buildingId ?? '_none';
      const buildingName = building?.name ?? 'Sans immeuble';
      if (!byBuilding.has(buildingId)) {
        byBuilding.set(buildingId, {
          buildingId,
          buildingName,
          outstandingCount: 0,
          outstandingTotalXaf: 0,
          tenants: new Set(),
        });
      }
      const agg = byBuilding.get(buildingId)!;
      agg.outstandingCount += 1;
      agg.outstandingTotalXaf += remainingXaf(decimalToNumber(p.amount), decimalToNumber(p.amountPaid));
      agg.tenants.add(p.lease.tenantId);
    }

    const items = [...byBuilding.values()]
      .map((b) => ({
        buildingId: b.buildingId,
        buildingName: b.buildingName,
        outstandingCount: b.outstandingCount,
        outstandingTotalXaf: b.outstandingTotalXaf,
        tenantCountAffected: b.tenants.size,
      }))
      .sort((a, b) => b.outstandingTotalXaf - a.outstandingTotalXaf)
      .slice(0, Math.max(1, Math.min(limit, 20)));

    return {
      asOf: new Date().toISOString(),
      currency: 'XAF',
      limit,
      items,
    };
  }

  async revenueDropExplanation(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<RevenueDropExplanation> {
    const thisMonth = utcThisMonth(now);
    const lastMonth = utcLastMonth(now);
    const asOf = now.toISOString();

    const [collectedThisMonthXaf, collectedLastMonthXaf, outstandingNow, outstandingLastPeriod, occupiedNow, lateThis, lateLast] =
      await Promise.all([
        this.sumCollectedForPeriod(organizationId, thisMonth),
        this.sumCollectedForPeriod(organizationId, lastMonth),
        this.sumOutstanding(organizationId),
        this.sumOutstandingForPeriod(organizationId, lastMonth),
        this.prisma.apartment.count({
          where: { organizationId, status: ApartmentStatus.OCCUPIED },
        }),
        this.prisma.payment.count({
          where: {
            organizationId,
            status: PaymentStatus.LATE,
            periodMonth: thisMonth.month,
            periodYear: thisMonth.year,
          },
        }),
        this.prisma.payment.count({
          where: {
            organizationId,
            status: PaymentStatus.LATE,
            periodMonth: lastMonth.month,
            periodYear: lastMonth.year,
          },
        }),
      ]);

    const hasAnySignal =
      collectedThisMonthXaf > 0 ||
      collectedLastMonthXaf > 0 ||
      outstandingNow.total > 0 ||
      outstandingLastPeriod.total > 0 ||
      lateThis > 0 ||
      lateLast > 0;

    if (!hasAnySignal) {
      return {
        sufficient: false,
        reason:
          'Données insuffisantes : aucun encaissement, impayé ni retard observé sur ce mois et le mois précédent.',
        asOf,
      };
    }

    const delta = revenueDelta(collectedLastMonthXaf, collectedThisMonthXaf);
    const factors: RevenueDropFactor[] = [
      {
        key: 'collected',
        label: 'Encaissements (PAID/PARTIAL via periodMonth/periodYear)',
        thisMonth: collectedThisMonthXaf,
        lastMonth: collectedLastMonthXaf,
        delta: collectedThisMonthXaf - collectedLastMonthXaf,
      },
      {
        key: 'outstanding',
        label: 'Reste à encaisser (impayés courants vs période mois dernier)',
        thisMonth: outstandingNow.total,
        lastMonth: outstandingLastPeriod.total,
        delta: outstandingNow.total - outstandingLastPeriod.total,
      },
      {
        key: 'occupancy_units',
        label: 'Logements occupés (stock actuel — historique mois non disponible)',
        thisMonth: occupiedNow,
        lastMonth: occupiedNow,
        delta: 0,
      },
      {
        key: 'late_count',
        label: 'Nombre de paiements LATE (période loyer)',
        thisMonth: lateThis,
        lastMonth: lateLast,
        delta: lateThis - lateLast,
      },
    ];

    return {
      sufficient: true,
      asOf,
      currency: 'XAF',
      thisMonth,
      lastMonth,
      collectedThisMonthXaf,
      collectedLastMonthXaf,
      deltaXaf: delta.deltaXaf,
      deltaPct: delta.deltaPct,
      direction: delta.direction,
      factors,
    };
  }

  async topUrgentIssues(
    organizationId: string,
    limit = 5,
    now: Date = new Date(),
  ): Promise<{ asOf: string; limit: number; items: UrgentIssue[] }> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const in30 = new Date(today);
    in30.setUTCDate(in30.getUTCDate() + 30);

    const [latePayments, pendingPastDue, vacantUnits, endingLeases, expiredLeases, maintenance] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: { organizationId, status: PaymentStatus.LATE },
          take: 40,
          orderBy: { dueDate: 'asc' },
          include: {
            lease: {
              include: {
                tenant: { select: { id: true, firstName: true, lastName: true } },
                apartment: { select: { id: true, label: true } },
              },
            },
          },
        }),
        this.prisma.payment.findMany({
          where: {
            organizationId,
            status: PaymentStatus.PENDING,
            dueDate: { lt: today },
          },
          take: 40,
          orderBy: { dueDate: 'asc' },
          include: {
            lease: {
              include: {
                tenant: { select: { id: true, firstName: true, lastName: true } },
                apartment: { select: { id: true, label: true } },
              },
            },
          },
        }),
        this.prisma.apartment.findMany({
          where: { organizationId, status: ApartmentStatus.AVAILABLE },
          take: 20,
          select: {
            id: true,
            label: true,
            leases: {
              where: { status: { in: [LeaseStatus.ACTIVE, LeaseStatus.DRAFT] } },
              select: { id: true },
              take: 1,
            },
          },
        }),
        this.prisma.lease.findMany({
          where: {
            organizationId,
            status: LeaseStatus.ACTIVE,
            endDate: { gte: today, lte: in30 },
          },
          take: 20,
          orderBy: { endDate: 'asc' },
          include: {
            tenant: { select: { id: true, firstName: true, lastName: true } },
            apartment: { select: { id: true, label: true } },
          },
        }),
        this.prisma.lease.findMany({
          where: { organizationId, status: LeaseStatus.EXPIRED },
          take: 15,
          orderBy: { endDate: 'asc' },
          include: {
            tenant: { select: { id: true, firstName: true, lastName: true } },
            apartment: { select: { id: true, label: true } },
          },
        }),
        this.prisma.maintenanceTicket.findMany({
          where: {
            organizationId,
            status: {
              in: [
                MaintenanceTicketStatus.OPEN,
                MaintenanceTicketStatus.IN_PROGRESS,
                MaintenanceTicketStatus.ASSIGNED,
              ],
            },
            priority: { in: [MaintenancePriority.HIGH, MaintenancePriority.CRITICAL] },
          },
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            priority: true,
            status: true,
            apartmentId: true,
          },
        }),
      ]);

    const issues: UrgentIssue[] = [];

    for (const p of latePayments) {
      const rem = remainingXaf(decimalToNumber(p.amount), decimalToNumber(p.amountPaid));
      const name = `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`;
      issues.push({
        type: 'LATE_PAYMENT',
        label: `Loyer en retard — ${name} (${p.lease.apartment.label})`,
        severity: 'critical',
        score: 100 + rem / 1000,
        why: `Statut LATE · reste ${rem.toLocaleString('fr-FR')} XAF · échéance ${p.dueDate.toISOString().slice(0, 10)} · ${p.periodMonth}/${p.periodYear}`,
        entityIds: {
          paymentId: p.id,
          tenantId: p.lease.tenant.id,
          apartmentId: p.lease.apartment.id,
          leaseId: p.leaseId,
        },
      });
    }

    for (const p of pendingPastDue) {
      const rem = remainingXaf(decimalToNumber(p.amount), decimalToNumber(p.amountPaid));
      const name = `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`;
      issues.push({
        type: 'PENDING_PAST_DUE',
        label: `Échéance dépassée — ${name} (${p.lease.apartment.label})`,
        severity: 'high',
        score: 80 + rem / 1000,
        why: `PENDING après dueDate ${p.dueDate.toISOString().slice(0, 10)} · reste ${rem.toLocaleString('fr-FR')} XAF`,
        entityIds: {
          paymentId: p.id,
          tenantId: p.lease.tenant.id,
          apartmentId: p.lease.apartment.id,
          leaseId: p.leaseId,
        },
      });
    }

    for (const l of expiredLeases) {
      const name = `${l.tenant.firstName} ${l.tenant.lastName}`;
      issues.push({
        type: 'LEASE_EXPIRED',
        label: `Bail expiré — ${name} (${l.apartment.label})`,
        severity: 'high',
        score: 75,
        why: `Statut EXPIRED · fin ${l.endDate.toISOString().slice(0, 10)}`,
        entityIds: {
          leaseId: l.id,
          tenantId: l.tenant.id,
          apartmentId: l.apartment.id,
        },
      });
    }

    for (const l of endingLeases) {
      const name = `${l.tenant.firstName} ${l.tenant.lastName}`;
      issues.push({
        type: 'LEASE_ENDING_SOON',
        label: `Bail bientôt fini — ${name} (${l.apartment.label})`,
        severity: 'medium',
        score: 55,
        why: `ACTIVE · fin ≤ 30 j (${l.endDate.toISOString().slice(0, 10)})`,
        entityIds: {
          leaseId: l.id,
          tenantId: l.tenant.id,
          apartmentId: l.apartment.id,
        },
      });
    }

    for (const t of maintenance) {
      const sev = t.priority === MaintenancePriority.CRITICAL ? 'critical' : 'high';
      issues.push({
        type: 'MAINTENANCE_HIGH',
        label: `Maintenance ${t.priority} — ${t.title}`,
        severity: sev,
        score: t.priority === MaintenancePriority.CRITICAL ? 90 : 70,
        why: `Ticket ${t.status} · priorité ${t.priority}`,
        entityIds: { ticketId: t.id, apartmentId: t.apartmentId },
      });
    }

    for (const a of vacantUnits) {
      if (a.leases.length > 0) continue;
      issues.push({
        type: 'VACANT_UNIT',
        label: `Logement vacant sans bail actif/brouillon — ${a.label}`,
        severity: 'low',
        score: 25,
        why: 'Statut AVAILABLE sans lease ACTIVE/DRAFT',
        entityIds: { apartmentId: a.id },
      });
    }

    const items = issues
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit, 20)));

    return { asOf: now.toISOString(), limit, items };
  }

  async portfolioSynthesis(organizationId: string, now: Date = new Date()): Promise<PortfolioSynthesis> {
    const dataSources = [
      'building.count',
      'apartment.count/status',
      'tenant.count',
      'lease.count/status',
      'payment.outstanding(PENDING|PARTIAL|LATE)',
      'payment.collected(PAID|PARTIAL period|paidAt)',
      'payment.groupByBuilding.outstanding',
      'payment/lease/maintenance urgent scoring',
      'payment.sumCollected periodMonth/periodYear',
    ];

    const [snapshot, ranking, urgent, periodCompare] = await Promise.all([
      this.portfolioSnapshot(organizationId, now),
      this.buildingsOutstandingRanking(organizationId, 3),
      this.topUrgentIssues(organizationId, 5, now),
      this.compareRevenuePeriods(organizationId, utcLastMonth(now), utcThisMonth(now)),
    ]);

    return {
      asOf: now.toISOString(),
      currency: 'XAF',
      snapshot,
      topBuildingsOutstanding: ranking.items,
      topUrgentIssues: urgent.items.slice(0, 3),
      periodCompare,
      dataSources,
    };
  }

  /** Sum amountPaid for PAID|PARTIAL filtered by periodMonth/periodYear (aligned with getOutstandingPayments). */
  private async sumCollectedForPeriod(organizationId: string, period: CalendarPeriod): Promise<number> {
    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] },
        periodMonth: period.month,
        periodYear: period.year,
      },
      select: { amountPaid: true },
    });
    return rows.reduce((sum, p) => sum + decimalToNumber(p.amountPaid), 0);
  }

  private async sumOutstanding(
    organizationId: string,
  ): Promise<{ count: number; total: number }> {
    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
      },
      select: { amount: true, amountPaid: true },
    });
    let total = 0;
    for (const p of rows) {
      total += remainingXaf(decimalToNumber(p.amount), decimalToNumber(p.amountPaid));
    }
    return { count: rows.length, total };
  }

  private async sumOutstandingForPeriod(
    organizationId: string,
    period: CalendarPeriod,
  ): Promise<{ count: number; total: number }> {
    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
        periodMonth: period.month,
        periodYear: period.year,
      },
      select: { amount: true, amountPaid: true },
    });
    let total = 0;
    for (const p of rows) {
      total += remainingXaf(decimalToNumber(p.amount), decimalToNumber(p.amountPaid));
    }
    return { count: rows.length, total };
  }
}

export { utcThisMonth, utcLastMonth, periodLabel };
