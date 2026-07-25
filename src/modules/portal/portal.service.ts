import { inject, injectable } from 'tsyringe';
import {
  LeaseStatus,
  MaintenanceEventType,
  MaintenanceTicketStatus,
  PaymentStatus,
  Prisma,
  RentalApplicationStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';

const leaseInclude = {
  apartment: { include: { building: true } },
  tenant: true,
  payments: { orderBy: { dueDate: 'desc' as const }, take: 12 },
} satisfies Prisma.LeaseInclude;

@injectable()
export class PortalService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(MaintenanceService) private readonly maintenance: MaintenanceService,
  ) {}

  private async tenantForUser(userId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { userId } });
    if (!tenant) throw new NotFoundError('Profil locataire non lié — contactez votre agence');
    return tenant;
  }

  /**
   * Tableau de bord locataire — logement courant, prochaine échéance, impayés,
   * demandes de maintenance ouvertes et notifications non lues.
   * Tout est dérivé du profil locataire lié au compte : aucune donnée d'une autre
   * organisation ni d'un autre locataire n'est atteignable.
   */
  async dashboard(userId: string) {
    const tenant = await this.tenantForUser(userId);

    const lease = await this.prisma.lease.findFirst({
      where: { tenantId: tenant.id, status: LeaseStatus.ACTIVE },
      include: { apartment: { include: { building: true } } },
      orderBy: { startDate: 'desc' },
    });

    const [nextPayment, latePayments, openTickets, unreadNotifications] = await Promise.all([
      this.prisma.payment.findFirst({
        where: {
          lease: { tenantId: tenant.id },
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: {
          lease: { tenantId: tenant.id },
          status: { in: [PaymentStatus.LATE, PaymentStatus.PARTIAL] },
        },
        select: { amount: true, amountPaid: true },
      }),
      this.prisma.maintenanceTicket.count({
        where: {
          tenantId: tenant.id,
          status: {
            notIn: [MaintenanceTicketStatus.CLOSED, MaintenanceTicketStatus.CANCELLED],
          },
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    const outstanding = latePayments.reduce(
      (sum, p) => sum + (Number(p.amount) - Number(p.amountPaid)),
      0,
    );

    return {
      tenant,
      lease,
      apartment: lease?.apartment ?? null,
      nextPayment,
      lateCount: latePayments.length,
      outstandingAmount: outstanding,
      openTickets,
      unreadNotifications,
    };
  }

  /** Logements du locataire (baux actifs + candidatures). */
  async listHomes(userId: string) {
    const tenant = await this.tenantForUser(userId);
    const [leases, applications] = await Promise.all([
      this.prisma.lease.findMany({
        where: { tenantId: tenant.id, status: LeaseStatus.ACTIVE },
        include: { apartment: { include: { building: true } } },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.rentalApplication.findMany({
        where: { applicantUserId: userId, status: { not: RentalApplicationStatus.WITHDRAWN } },
        include: { apartment: { include: { building: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);
    return { leases, applications, tenant };
  }

  async getActiveLease(userId: string) {
    const tenant = await this.tenantForUser(userId);
    const lease = await this.prisma.lease.findFirst({
      where: { tenantId: tenant.id, status: LeaseStatus.ACTIVE },
      include: leaseInclude,
      orderBy: { startDate: 'desc' },
    });
    if (!lease) throw new NotFoundError('Aucun bail actif');
    return lease;
  }

  async listPayments(userId: string) {
    const tenant = await this.tenantForUser(userId);
    return this.prisma.payment.findMany({
      where: { lease: { tenantId: tenant.id } },
      include: { lease: { include: { apartment: true } } },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      take: 48,
    });
  }

  async listMaintenance(userId: string) {
    const tenant = await this.tenantForUser(userId);
    return this.prisma.maintenanceTicket.findMany({
      where: { tenantId: tenant.id },
      include: {
        apartment: { include: { building: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createMaintenance(
    userId: string,
    data: { title: string; description?: string; apartmentId?: string },
    actor: { userId: string; name: string },
  ) {
    const tenant = await this.tenantForUser(userId);
    let apartmentId = data.apartmentId;
    let leaseId: string | undefined;

    if (!apartmentId) {
      const lease = await this.prisma.lease.findFirst({
        where: { tenantId: tenant.id, status: LeaseStatus.ACTIVE },
        orderBy: { startDate: 'desc' },
      });
      if (!lease) throw new ValidationError('Aucun logement actif — précisez l\'appartement');
      apartmentId = lease.apartmentId;
      leaseId = lease.id;
    } else {
      const lease = await this.prisma.lease.findFirst({
        where: { tenantId: tenant.id, apartmentId, status: LeaseStatus.ACTIVE },
      });
      if (!lease) throw new ForbiddenError('Ce logement ne vous appartient pas');
      leaseId = lease.id;
    }

    return this.maintenance.create(
      tenant.organizationId,
      {
        apartmentId,
        tenantId: tenant.id,
        leaseId,
        title: data.title,
        description: data.description,
      },
      actor,
    );
  }

  async getMaintenance(userId: string, ticketId: string) {
    const tenant = await this.tenantForUser(userId);
    const ticket = await this.prisma.maintenanceTicket.findFirst({
      where: { id: ticketId, tenantId: tenant.id },
      include: {
        apartment: { include: { building: true } },
        events: { orderBy: { createdAt: 'asc' } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });
    if (!ticket) throw new NotFoundError('Ticket introuvable');
    return ticket;
  }

  /** Message locataire ↔ fil d'événements de la demande (visible agent / staff). */
  async addMaintenanceComment(
    userId: string,
    ticketId: string,
    message: string,
    actor: { userId: string; name: string },
  ) {
    const tenant = await this.tenantForUser(userId);
    const ticket = await this.prisma.maintenanceTicket.findFirst({
      where: { id: ticketId, tenantId: tenant.id },
    });
    if (!ticket) throw new NotFoundError('Ticket introuvable');
    if (
      ticket.status === MaintenanceTicketStatus.CLOSED ||
      ticket.status === MaintenanceTicketStatus.CANCELLED
    ) {
      throw new ValidationError('Cette demande est clôturée');
    }

    await this.prisma.maintenanceTicketEvent.create({
      data: {
        ticketId,
        organizationId: tenant.organizationId,
        type: MaintenanceEventType.NOTE_ADDED,
        message: `[Locataire] ${message}`,
        actorId: actor.userId,
        actorName: actor.name,
      },
    });

    return this.getMaintenance(userId, ticketId);
  }

  /**
   * Le locataire confirme que le problème est résolu après COMPLETED → CLOSED.
   * Le propriétaire n'a pas à gérer l'échange : l'historique journalise la confirmation.
   */
  async confirmMaintenanceResolved(
    userId: string,
    ticketId: string,
    actor: { userId: string; name: string },
  ) {
    const tenant = await this.tenantForUser(userId);
    const ticket = await this.prisma.maintenanceTicket.findFirst({
      where: { id: ticketId, tenantId: tenant.id },
    });
    if (!ticket) throw new NotFoundError('Ticket introuvable');
    if (ticket.status !== MaintenanceTicketStatus.COMPLETED) {
      throw new ValidationError(
        'Vous pourrez confirmer uniquement lorsque l\'agent aura marqué l\'intervention comme terminée',
      );
    }

    await this.prisma.maintenanceTicketEvent.create({
      data: {
        ticketId,
        organizationId: tenant.organizationId,
        type: MaintenanceEventType.NOTE_ADDED,
        message: 'Résolution confirmée par le locataire',
        actorId: actor.userId,
        actorName: actor.name,
      },
    });

    return this.maintenance.close(tenant.organizationId, ticketId, actor);
  }
}
