import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, LeaseStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { TtlCache } from '../../shared/utils/ttl-cache.js';
import { env } from '../../config/env.js';

/** Contexte organisation scoping — données agrégées pour l'IA (pas de dump brut) */
export interface AiOrganizationContext {
  organization: { id: string; name: string; city: string; plan: string };
  summary: {
    totalBuildings: number;
    totalApartments: number;
    availableApartments: number;
    occupiedApartments: number;
    activeLeases: number;
    totalTenants: number;
    latePayments: number;
    pendingPayments: number;
    collectedThisMonthXaf: number;
    potentialMonthlyRentXaf: number;
    occupancyRate: number;
  };
  buildings: Array<{
    name: string;
    apartmentCount: number;
    occupiedCount: number;
    potentialRentXaf: number;
  }>;
  latePayments: Array<{
    tenantName: string;
    apartmentLabel: string;
    amountXaf: number;
    dueDate: string;
    period: string;
  }>;
  availableApartments: Array<{ label: string; rentXaf: number; buildingName?: string }>;
  expiringLeases: Array<{ tenantName: string; apartmentLabel: string; endDate: string }>;
}

@injectable()
export class AiContextService {
  private readonly cache = new TtlCache<AiOrganizationContext>(env.AI_CONTEXT_CACHE_TTL_MS);

  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async buildContext(organizationId: string): Promise<AiOrganizationContext> {
    const cached = this.cache.get(organizationId);
    if (cached) return cached;

    const ctx = await this.fetchContext(organizationId);
    this.cache.set(organizationId, ctx);
    return ctx;
  }

  invalidateOrganization(organizationId: string): void {
    this.cache.invalidate(organizationId);
  }

  private async fetchContext(organizationId: string): Promise<AiOrganizationContext> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, city: true, plan: true },
    });

    if (!org) throw new Error('Organisation introuvable');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const leaseExpiryLimit = new Date();
    leaseExpiryLimit.setDate(leaseExpiryLimit.getDate() + 30);

    const [
      totalBuildings,
      totalApartments,
      availableApartments,
      occupiedApartments,
      activeLeases,
      totalTenants,
      latePaymentsCount,
      pendingPaymentsCount,
      collectedPayments,
      latePayments,
      availableApts,
      expiringLeases,
      buildingsRaw,
      allAptsRent,
    ] = await Promise.all([
      this.prisma.building.count({ where: { organizationId } }),
      this.prisma.apartment.count({ where: { organizationId } }),
      this.prisma.apartment.count({ where: { organizationId, status: ApartmentStatus.AVAILABLE } }),
      this.prisma.apartment.count({ where: { organizationId, status: ApartmentStatus.OCCUPIED } }),
      this.prisma.lease.count({ where: { organizationId, status: LeaseStatus.ACTIVE } }),
      this.prisma.tenant.count({ where: { organizationId } }),
      this.prisma.payment.count({ where: { organizationId, status: PaymentStatus.LATE } }),
      this.prisma.payment.count({
        where: { organizationId, status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] } },
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId,
          status: PaymentStatus.PAID,
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        select: { amountPaid: true },
      }),
      this.prisma.payment.findMany({
        where: { organizationId, status: PaymentStatus.LATE },
        take: 5,
        orderBy: { dueDate: 'asc' },
        include: {
          lease: { include: { tenant: true, apartment: true } },
        },
      }),
      this.prisma.apartment.findMany({
        where: { organizationId, status: ApartmentStatus.AVAILABLE },
        take: 5,
        select: { label: true, rentAmount: true, building: { select: { name: true } } },
      }),
      this.prisma.lease.findMany({
        where: {
          organizationId,
          status: LeaseStatus.ACTIVE,
          endDate: { lte: leaseExpiryLimit },
        },
        take: 5,
        orderBy: { endDate: 'asc' },
        include: { tenant: true, apartment: true },
      }),
      this.prisma.building.findMany({
        where: { organizationId },
        take: 8,
        select: {
          name: true,
          apartments: { select: { status: true, rentAmount: true } },
        },
      }),
      this.prisma.apartment.findMany({
        where: { organizationId },
        select: { rentAmount: true },
      }),
    ]);

    const collectedThisMonthXaf = collectedPayments.reduce(
      (sum, p) => sum + decimalToNumber(p.amountPaid),
      0,
    );
    const potentialMonthlyRentXaf = allAptsRent.reduce(
      (sum, a) => sum + decimalToNumber(a.rentAmount),
      0,
    );
    const occupancyRate =
      totalApartments > 0 ? Math.round((occupiedApartments / totalApartments) * 100) : 0;

    const buildings = buildingsRaw.map((b) => {
      const occupiedCount = b.apartments.filter((a) => a.status === ApartmentStatus.OCCUPIED).length;
      const potentialRentXaf = b.apartments.reduce((s, a) => s + decimalToNumber(a.rentAmount), 0);
      return {
        name: b.name,
        apartmentCount: b.apartments.length,
        occupiedCount,
        potentialRentXaf,
      };
    });

    return {
      organization: { id: org.id, name: org.name, city: org.city, plan: org.plan },
      summary: {
        totalBuildings,
        totalApartments,
        availableApartments,
        occupiedApartments,
        activeLeases,
        totalTenants,
        latePayments: latePaymentsCount,
        pendingPayments: pendingPaymentsCount,
        collectedThisMonthXaf,
        potentialMonthlyRentXaf,
        occupancyRate,
      },
      buildings,
      latePayments: latePayments.map((p) => ({
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
        amountXaf: decimalToNumber(p.amount),
        dueDate: p.dueDate.toISOString().split('T')[0]!,
        period: `${p.periodMonth}/${p.periodYear}`,
      })),
      availableApartments: availableApts.map((a) => ({
        label: a.label,
        rentXaf: decimalToNumber(a.rentAmount),
        buildingName: a.building?.name,
      })),
      expiringLeases: expiringLeases.map((l) => ({
        tenantName: `${l.tenant.firstName} ${l.tenant.lastName}`,
        apartmentLabel: l.apartment.label,
        endDate: l.endDate.toISOString().split('T')[0]!,
      })),
    };
  }

  toPromptContext(ctx: AiOrganizationContext): string {
    return JSON.stringify(ctx, null, 2);
  }
}
