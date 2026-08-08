import { inject, injectable } from 'tsyringe';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError } from '../../shared/errors/app.error.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';

export interface BuildingInput {
  name: string;
  address: string;
  district?: string;
  city?: string;
  floorCount?: number;
  latitude?: number;
  longitude?: number;
  description?: string;
}

@injectable()
export class BuildingRepository {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  findMany(organizationId: string, skip: number, limit: number) {
    return Promise.all([
      this.prisma.building.findMany({
        where: { organizationId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { apartments: true } },
          apartments: {
            take: 8,
            orderBy: { createdAt: 'asc' },
            include: {
              documents: {
                where: { type: 'APARTMENT_PHOTO' },
                take: 1,
                orderBy: { createdAt: 'asc' },
                select: { cloudinaryUrl: true },
              },
            },
          },
        },
      }),
      this.prisma.building.count({ where: { organizationId } }),
    ]);
  }

  findById(organizationId: string, id: string) {
    return this.prisma.building.findFirst({
      where: { id, organizationId },
      include: { apartments: true },
    });
  }

  create(organizationId: string, data: BuildingInput) {
    return this.prisma.building.create({
      data: { ...data, organizationId, city: data.city ?? 'Brazzaville' },
    });
  }

  update(organizationId: string, id: string, data: Partial<BuildingInput>) {
    return this.prisma.building.updateMany({
      where: { id, organizationId },
      data,
    });
  }

  delete(organizationId: string, id: string) {
    return this.prisma.building.deleteMany({ where: { id, organizationId } });
  }
}

@injectable()
export class BuildingService {
  constructor(
    @inject(BuildingRepository) private readonly repo: BuildingRepository,
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(SubscriptionService) private readonly subscriptionService: SubscriptionService,
  ) {}

  async list(organizationId: string, page: number, limit: number, skip: number) {
    const [raw, total] = await this.repo.findMany(organizationId, skip, limit);
    const items = raw.map((b) => {
      const coverUrl =
        b.apartments
          .flatMap((a) => a.documents.map((d) => d.cloudinaryUrl))
          .find((url) => !!url) ?? null;
      const { apartments, ...rest } = b;
      return {
        ...rest,
        coverUrl,
        apartmentsCount: b._count.apartments,
      };
    });
    return { items, total };
  }

  async get(organizationId: string, id: string) {
    const building = await this.repo.findById(organizationId, id);
    if (!building) throw new NotFoundError('Immeuble introuvable');
    return building;
  }

  create(organizationId: string, data: BuildingInput) {
    return this.repo.create(organizationId, data);
  }

  async update(organizationId: string, id: string, data: Partial<BuildingInput>) {
    await this.get(organizationId, id);
    await this.repo.update(organizationId, id, data);
    return this.get(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.get(organizationId, id);
    await this.repo.delete(organizationId, id);
  }

  async generateApartments(
    organizationId: string,
    buildingId: string,
    input: { count: number; defaultRentAmount: number; rooms?: number; surface?: number },
  ) {
    const building = await this.get(organizationId, buildingId);
    const apartments = [];

    for (let i = 0; i < input.count; i++) {
      await this.subscriptionService.assertCanCreateApartment(organizationId);
      const apt = await this.prisma.apartment.create({
        data: {
          organizationId,
          buildingId: building.id,
          label: `Porte ${i + 1}`,
          floor: Math.floor(i / 4),
          rooms: input.rooms,
          surface: input.surface,
          rentAmount: input.defaultRentAmount,
        },
      });
      apartments.push(apt);
    }

    return apartments;
  }

  /** Vue complète immeuble : stats, unités, revenus, dépenses, maintenance. */
  async getOverview(organizationId: string, buildingId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, organizationId },
    });
    if (!building) throw new NotFoundError('Immeuble introuvable');

    const apartments = await this.prisma.apartment.findMany({
      where: { organizationId, buildingId },
      orderBy: { label: 'asc' },
      include: {
        leases: {
          where: { status: { in: ['ACTIVE', 'DRAFT'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { tenant: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        },
        maintenanceTickets: {
          where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
          select: { id: true, title: true, status: true, priority: true },
        },
        documents: {
          where: { type: 'APARTMENT_PHOTO' },
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { cloudinaryUrl: true },
        },
        _count: { select: { leases: true } },
      },
    });

    const coverUrl =
      apartments.flatMap((a) => a.documents.map((d) => d.cloudinaryUrl)).find((url) => !!url) ?? null;

    const apartmentIds = apartments.map((a) => a.id);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const payments = apartmentIds.length
      ? await this.prisma.payment.findMany({
          where: {
            organizationId,
            lease: { apartmentId: { in: apartmentIds } },
          },
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { dueDate: 'desc' }],
          take: 100,
          include: {
            lease: {
              include: {
                tenant: { select: { id: true, firstName: true, lastName: true } },
                apartment: { select: { id: true, label: true } },
              },
            },
          },
        })
      : [];

    const expenses = await this.prisma.buildingExpense.findMany({
      where: { organizationId, buildingId },
      orderBy: { incurredAt: 'desc' },
      take: 100,
      include: {
        apartment: { select: { id: true, label: true } },
        maintenanceTicket: { select: { id: true, title: true } },
      },
    });

    const tickets = apartmentIds.length
      ? await this.prisma.maintenanceTicket.findMany({
          where: { organizationId, apartmentId: { in: apartmentIds } },
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          include: {
            apartment: { select: { id: true, label: true } },
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            tenant: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : [];

    const toNum = (v: unknown) => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
        return (v as { toNumber: () => number }).toNumber();
      }
      return Number(v) || 0;
    };

    let occupied = 0;
    let vacant = 0;
    let maintenance = 0;
    let unavailable = 0;
    let expectedMonthly = 0;
    let activeLeases = 0;
    const tenantIds = new Set<string>();
    let unitsWithProblems = 0;

    const units = apartments.map((a) => {
      const status = a.status;
      if (status === 'OCCUPIED') occupied += 1;
      else if (status === 'AVAILABLE') vacant += 1;
      else if (status === 'MAINTENANCE') maintenance += 1;
      else unavailable += 1;

      expectedMonthly += toNum(a.rentAmount);
      const lease = a.leases[0] ?? null;
      if (lease?.status === 'ACTIVE') {
        activeLeases += 1;
        if (lease.tenantId) tenantIds.add(lease.tenantId);
      }
      const openTickets = a.maintenanceTickets.length;
      if (openTickets > 0) unitsWithProblems += 1;

      return {
        id: a.id,
        label: a.label,
        floor: a.floor,
        rooms: a.rooms,
        surface: a.surface != null ? toNum(a.surface) : null,
        rentAmount: toNum(a.rentAmount),
        currency: a.currency,
        status: a.status,
        openTickets,
        tenant: lease?.tenant
          ? {
              id: lease.tenant.id,
              name: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
              phone: lease.tenant.phone,
            }
          : null,
        lease: lease
          ? { id: lease.id, status: lease.status, monthlyRent: toNum(lease.monthlyRent) }
          : null,
      };
    });

    const total = apartments.length;
    const occupancyRate = total === 0 ? 0 : Math.round((occupied / total) * 1000) / 10;

    let collectedThisMonth = 0;
    let unpaidAmount = 0;
    let lateCount = 0;
    let collectedYear = 0;
    let expectedThisMonthFromPayments = 0;

    for (const p of payments) {
      const amount = toNum(p.amount);
      const paid = toNum(p.amountPaid);
      if (p.periodYear === year) collectedYear += paid;
      if (p.periodYear === year && p.periodMonth === month) {
        expectedThisMonthFromPayments += amount;
        collectedThisMonth += paid;
        if (p.status === 'LATE' || (p.status === 'PENDING' && new Date(p.dueDate) < now)) lateCount += 1;
        if (p.status !== 'PAID' && p.status !== 'CANCELLED') unpaidAmount += Math.max(0, amount - paid);
      }
    }

    let expensesThisMonth = 0;
    let expensesThisYear = 0;
    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      const amount = toNum(e.amount);
      const d = new Date(e.incurredAt);
      if (d.getFullYear() === year) {
        expensesThisYear += amount;
        if (d.getMonth() + 1 === month) expensesThisMonth += amount;
      }
      byCategory[e.category] = (byCategory[e.category] ?? 0) + amount;
    }

    const recoveryRate =
      expectedThisMonthFromPayments > 0
        ? Math.round((collectedThisMonth / expectedThisMonthFromPayments) * 1000) / 10
        : expectedMonthly > 0
          ? Math.round((collectedThisMonth / expectedMonthly) * 1000) / 10
          : 0;

    return {
      building: { ...building, coverUrl },
      summary: {
        apartmentsTotal: total,
        occupied,
        vacant,
        maintenance,
        unavailable,
        occupancyRate,
        activeLeases,
        tenantsCount: tenantIds.size,
        unitsWithProblems,
        expectedMonthlyRent: expectedMonthly,
        collectedThisMonth,
        collectedThisYear: collectedYear,
        unpaidAmount,
        lateCount,
        expectedThisMonth: expectedThisMonthFromPayments || expectedMonthly,
        recoveryRate,
        expensesThisMonth,
        expensesThisYear,
        balanceThisMonth: collectedThisMonth - expensesThisMonth,
        expensesByCategory: byCategory,
      },
      units,
      payments: payments.slice(0, 40).map((p) => ({
        id: p.id,
        amount: toNum(p.amount),
        amountPaid: toNum(p.amountPaid),
        status: p.status,
        method: p.method,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        periodMonth: p.periodMonth,
        periodYear: p.periodYear,
        reference: p.reference,
        apartmentLabel: p.lease.apartment.label,
        apartmentId: p.lease.apartment.id,
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`.trim(),
        leaseId: p.leaseId,
      })),
      expenses: expenses.slice(0, 40).map((e) => ({
        id: e.id,
        amount: toNum(e.amount),
        currency: e.currency,
        category: e.category,
        incurredAt: e.incurredAt,
        description: e.description,
        vendor: e.vendor,
        apartmentId: e.apartmentId,
        apartmentLabel: e.apartment?.label ?? null,
        maintenanceTicketId: e.maintenanceTicketId,
        maintenanceTitle: e.maintenanceTicket?.title ?? null,
      })),
      maintenance: tickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        closedAt: t.closedAt,
        estimatedCost: t.estimatedCost != null ? toNum(t.estimatedCost) : null,
        actualCost: t.actualCost != null ? toNum(t.actualCost) : null,
        apartmentId: t.apartmentId,
        apartmentLabel: t.apartment.label,
        assignedToName:
          t.assignedToName ??
          (t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`.trim() : null),
        tenantName: t.tenant ? `${t.tenant.firstName} ${t.tenant.lastName}`.trim() : null,
      })),
    };
  }
}
