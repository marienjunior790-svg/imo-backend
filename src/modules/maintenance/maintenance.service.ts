import { inject, injectable } from 'tsyringe';
import {
  ApartmentStatus,
  LeaseStatus,
  MaintenanceEventType,
  MaintenancePriority,
  MaintenanceTicketStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { isMaintenanceAgent } from '../../shared/auth/roles.js';
import { NotificationService } from '../notifications/notification.service.js';
import { N8nWebhookService } from '../../infrastructure/automation/n8n.service.js';
import { AutomationEvent } from '../../infrastructure/automation/automation.events.js';
import { appendTicketPhoto, type PhotoPhase, type PhotoRef } from './maintenance.photos.js';
import {
  assertAgentAcceptStatus,
  assertAgentCloseStatus,
  assertAgentCompleteStatus,
  assertAgentRefuseStatus,
  assertAgentStartStatus,
} from './maintenance.transitions.js';

const URGENT_KEYWORDS = ['urgent', 'fuite', 'gaz', 'électri', 'electri', 'incendie', 'inondation', 'panne'];
const LOW_KEYWORDS = ['peinture', 'nettoyage', 'porte', 'ampoule', 'cosmétique'];

export function classifyPriority(title: string, description?: string | null): MaintenancePriority {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (URGENT_KEYWORDS.some((k) => text.includes(k))) return MaintenancePriority.HIGH;
  if (LOW_KEYWORDS.some((k) => text.includes(k))) return MaintenancePriority.LOW;
  return MaintenancePriority.MEDIUM;
}

const ticketInclude = {
  apartment: { include: { building: true } },
  tenant: true,
  lease: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, phone: true } },
  reportedBy: { select: { id: true, firstName: true, lastName: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.MaintenanceTicketInclude;

@injectable()
export class MaintenanceService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(NotificationService) private readonly notifications: NotificationService,
    @inject(N8nWebhookService) private readonly n8n: N8nWebhookService,
  ) {}

  async list(
    organizationId: string,
    skip: number,
    limit: number,
    filters: {
      status?: MaintenanceTicketStatus;
      priority?: MaintenancePriority;
      apartmentId?: string;
      buildingId?: string;
    },
  ) {
    const where: Prisma.MaintenanceTicketWhereInput = {
      organizationId,
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.apartmentId && { apartmentId: filters.apartmentId }),
      ...(filters.buildingId && { apartment: { buildingId: filters.buildingId } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.maintenanceTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          apartment: { include: { building: true } },
          tenant: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.maintenanceTicket.count({ where }),
    ]);

    return { items, total };
  }

  async get(organizationId: string, id: string) {
    const ticket = await this.prisma.maintenanceTicket.findFirst({
      where: { id, organizationId },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundError('Ticket introuvable');
    return ticket;
  }

  async create(
    organizationId: string,
    data: {
      apartmentId: string;
      tenantId?: string;
      leaseId?: string;
      title: string;
      description?: string;
      priority?: MaintenancePriority;
    },
    actor?: { userId: string; name: string },
  ) {
    const apartment = await this.prisma.apartment.findFirst({
      where: { id: data.apartmentId, organizationId },
    });
    if (!apartment) throw new NotFoundError('Appartement introuvable');

    const priority = data.priority ?? classifyPriority(data.title, data.description);

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.maintenanceTicket.create({
        data: {
          organizationId,
          apartmentId: data.apartmentId,
          tenantId: data.tenantId,
          leaseId: data.leaseId,
          title: data.title,
          description: data.description,
          priority,
          status: MaintenanceTicketStatus.OPEN,
          reportedById: actor?.userId,
        },
        include: ticketInclude,
      });

      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: created.id,
          organizationId,
          type: MaintenanceEventType.CREATED,
          message: `Ticket créé — priorité ${priorityLabel(priority)}`,
          actorId: actor?.userId,
          actorName: actor?.name,
        },
      });

      if (priority === MaintenancePriority.HIGH || priority === MaintenancePriority.CRITICAL) {
        await tx.apartment.update({
          where: { id: data.apartmentId },
          data: { status: ApartmentStatus.MAINTENANCE },
        });
      }

      return created;
    });

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    const payload = this.toWebhookPayload(ticket, org?.name);

    this.n8n.emit({ event: AutomationEvent.MAINTENANCE_CREATED, organizationId, organizationName: org?.name, data: payload });
    await this.notifications.notifyOrganizationStaff({
      organizationId,
      type: NotificationType.MAINTENANCE_CREATED,
      title: 'Nouveau ticket maintenance',
      message: `${ticket.title} — ${ticket.apartment.label}`,
      data: payload,
    });

    // Assignation automatique si un agent de maintenance est disponible (least-busy).
    try {
      const auto = await this.tryAutoAssign(organizationId, ticket.id, actor);
      if (auto) return auto;
    } catch (err) {
      console.error('[maintenance] auto-assign failed (non-blocking)', err);
    }

    return this.get(organizationId, ticket.id);
  }

  /**
   * Choisit l'agent actif avec le moins de tickets ouverts (OPEN/ASSIGNED/IN_PROGRESS).
   * No-op s'il n'y a aucun agent.
   */
  async tryAutoAssign(
    organizationId: string,
    ticketId: string,
    actor?: { userId: string; name: string },
  ) {
    const agents = await this.listMaintenanceAgents(organizationId);
    if (agents.length === 0) return null;

    const openStatuses = [
      MaintenanceTicketStatus.OPEN,
      MaintenanceTicketStatus.ASSIGNED,
      MaintenanceTicketStatus.IN_PROGRESS,
    ];
    const loads = await Promise.all(
      agents.map(async (a) => {
        const count = await this.prisma.maintenanceTicket.count({
          where: { organizationId, assignedToId: a.id, status: { in: openStatuses } },
        });
        return { agent: a, count };
      }),
    );
    loads.sort((a, b) => a.count - b.count || a.agent.lastName.localeCompare(b.agent.lastName));
    const chosen = loads[0]!.agent;

    return this.assign(
      organizationId,
      ticketId,
      {
        assignedToId: chosen.id,
        note: 'Assignation automatique (charge la plus faible)',
      },
      actor ?? { userId: 'system', name: 'Système' },
    );
  }

  async assign(
    organizationId: string,
    id: string,
    data: { assignedToId?: string; assignedToName?: string; note?: string },
    actor?: { userId: string; name: string },
  ) {
    const ticket = await this.get(organizationId, id);
    if (ticket.status === MaintenanceTicketStatus.CLOSED || ticket.status === MaintenanceTicketStatus.CANCELLED) {
      throw new ValidationError('Ticket déjà clôturé');
    }

    let assigneeName = data.assignedToName;
    if (data.assignedToId) {
      const user = await this.prisma.user.findFirst({
        where: { id: data.assignedToId, organizationId, isActive: true },
      });
      if (!user) throw new NotFoundError('Technicien introuvable');
      if (!isMaintenanceAgent(user.role)) {
        throw new ValidationError('L\'assigné doit être un agent de maintenance actif');
      }
      assigneeName = `${user.firstName} ${user.lastName}`;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id },
        data: {
          assignedToId: data.assignedToId ?? null,
          assignedToName: assigneeName ?? null,
          status: MaintenanceTicketStatus.ASSIGNED,
        },
      });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          organizationId,
          type: MaintenanceEventType.ASSIGNED,
          message: `Assigné à ${assigneeName ?? 'technicien'}`,
          actorId: actor?.userId,
          actorName: actor?.name,
        },
      });
      if (data.note) {
        await tx.maintenanceTicketEvent.create({
          data: {
            ticketId: id,
            organizationId,
            type: MaintenanceEventType.NOTE_ADDED,
            message: data.note,
            actorId: actor?.userId,
            actorName: actor?.name,
          },
        });
      }
    });

    const updated = await this.get(organizationId, id);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    const payload = { ...this.toWebhookPayload(updated, org?.name), assigneeName };

    this.n8n.emit({ event: AutomationEvent.MAINTENANCE_ASSIGNED, organizationId, organizationName: org?.name, data: payload });
    await this.notifications.notifyOrganizationStaff({
      organizationId,
      type: NotificationType.MAINTENANCE_ASSIGNED,
      title: 'Ticket assigné',
      message: `${updated.title} → ${assigneeName}`,
      data: payload,
    });

    if (data.assignedToId) {
      await this.notifications.notifyUser({
        organizationId,
        userId: data.assignedToId,
        type: NotificationType.MAINTENANCE_ASSIGNED,
        title: 'Nouvelle intervention assignée',
        message: updated.title,
        data: payload,
      });
    }

    return updated;
  }

  async start(organizationId: string, id: string, actor?: { userId: string; name: string }) {
    return this.transition(organizationId, id, MaintenanceTicketStatus.IN_PROGRESS, 'Intervention démarrée', actor);
  }

  async complete(organizationId: string, id: string, actor?: { userId: string; name: string }) {
    const updated = await this.transition(organizationId, id, MaintenanceTicketStatus.COMPLETED, 'Intervention terminée', actor);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    const payload = this.toWebhookPayload(updated, org?.name);
    this.n8n.emit({ event: AutomationEvent.MAINTENANCE_COMPLETED, organizationId, organizationName: org?.name, data: payload });
    await this.notifications.notifyOrganizationStaff({
      organizationId,
      type: NotificationType.MAINTENANCE_COMPLETED,
      title: 'Intervention terminée',
      message: `${updated.title} — en attente de confirmation locataire`,
      data: payload,
    });

    const tenantUserId =
      (updated.tenant as { userId?: string | null } | null)?.userId ?? updated.reportedById ?? null;
    if (tenantUserId) {
      await this.notifications.notifyUser({
        organizationId,
        userId: tenantUserId,
        type: NotificationType.MAINTENANCE_COMPLETED,
        title: 'Intervention terminée — confirmez la résolution',
        message: `L'agent a terminé « ${updated.title} ». Merci de confirmer que le problème est résolu.`,
        data: { ...payload, ticketId: id },
      });
    }

    return updated;
  }

  async close(organizationId: string, id: string, actor?: { userId: string; name: string }) {
    const ticket = await this.get(organizationId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id },
        data: { status: MaintenanceTicketStatus.CLOSED, closedAt: new Date() },
      });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          organizationId,
          type: MaintenanceEventType.CLOSED,
          message: 'Ticket clôturé et archivé',
          actorId: actor?.userId,
          actorName: actor?.name,
        },
      });

      const openCount = await tx.maintenanceTicket.count({
        where: {
          apartmentId: ticket.apartmentId,
          status: { notIn: [MaintenanceTicketStatus.CLOSED, MaintenanceTicketStatus.CANCELLED] },
          id: { not: id },
        },
      });

      if (openCount === 0) {
        const activeLease = await tx.lease.findFirst({
          where: { apartmentId: ticket.apartmentId, status: LeaseStatus.ACTIVE },
        });
        await tx.apartment.update({
          where: { id: ticket.apartmentId },
          data: { status: activeLease ? ApartmentStatus.OCCUPIED : ApartmentStatus.AVAILABLE },
        });
      }
    });

    const updated = await this.get(organizationId, id);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    this.n8n.emit({
      event: AutomationEvent.MAINTENANCE_CLOSED,
      organizationId,
      organizationName: org?.name,
      data: this.toWebhookPayload(updated, org?.name),
    });
    return updated;
  }

  async addNote(organizationId: string, id: string, message: string, actor?: { userId: string; name: string }) {
    await this.get(organizationId, id);
    await this.prisma.maintenanceTicketEvent.create({
      data: {
        ticketId: id,
        organizationId,
        type: MaintenanceEventType.NOTE_ADDED,
        message,
        actorId: actor?.userId,
        actorName: actor?.name,
      },
    });
    return this.get(organizationId, id);
  }

  async update(
    organizationId: string,
    id: string,
    data: { title?: string; description?: string; priority?: MaintenancePriority },
    actor?: { userId: string; name: string },
  ) {
    const existing = await this.get(organizationId, id);
    if (existing.status === MaintenanceTicketStatus.CLOSED) {
      throw new ValidationError('Ticket clôturé');
    }

    await this.prisma.maintenanceTicket.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority && { priority: data.priority }),
      },
    });

    if (data.priority && data.priority !== existing.priority) {
      await this.prisma.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          organizationId,
          type: MaintenanceEventType.PRIORITY_SET,
          message: `Priorité : ${priorityLabel(data.priority)}`,
          actorId: actor?.userId,
          actorName: actor?.name,
        },
      });
    }

    return this.get(organizationId, id);
  }

  private async transition(
    organizationId: string,
    id: string,
    status: MaintenanceTicketStatus,
    message: string,
    actor?: { userId: string; name: string },
  ) {
    const ticket = await this.get(organizationId, id);
    if (ticket.status === MaintenanceTicketStatus.CLOSED) {
      throw new ValidationError('Ticket clôturé');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({ where: { id }, data: { status } });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          organizationId,
          type: MaintenanceEventType.STATUS_CHANGED,
          message,
          actorId: actor?.userId,
          actorName: actor?.name,
        },
      });
    });

    return this.get(organizationId, id);
  }

  // ─── Portail agent de maintenance ──────────────────────────────────────────

  /** Interventions assignées à l'agent connecté (double scope org + assignation). */
  async listForAgent(
    organizationId: string,
    userId: string,
    skip: number,
    limit: number,
    filters: { status?: MaintenanceTicketStatus; priority?: MaintenancePriority },
  ) {
    const where: Prisma.MaintenanceTicketWhereInput = {
      organizationId,
      assignedToId: userId,
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
    };

    const [items, total] = await Promise.all([
      this.prisma.maintenanceTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          apartment: { include: { building: true } },
          tenant: true,
        },
      }),
      this.prisma.maintenanceTicket.count({ where }),
    ]);

    return { items, total };
  }

  async getForAgent(organizationId: string, userId: string, id: string) {
    const ticket = await this.prisma.maintenanceTicket.findFirst({
      where: { id, organizationId, assignedToId: userId },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundError('Intervention introuvable');
    return ticket;
  }

  async acceptJob(organizationId: string, id: string, actor: { userId: string; name: string }) {
    const ticket = await this.getForAgent(organizationId, actor.userId, id);
    assertAgentAcceptStatus(ticket.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id },
        data: {
          status: MaintenanceTicketStatus.ASSIGNED,
          assignedToId: actor.userId,
          assignedToName: actor.name,
        },
      });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          organizationId,
          type: MaintenanceEventType.STATUS_CHANGED,
          message: 'Mission acceptée par l\'agent',
          actorId: actor.userId,
          actorName: actor.name,
        },
      });
    });

    return this.getForAgent(organizationId, actor.userId, id);
  }

  /**
   * Refus de mission : libère l'assignation (retour OPEN) pour réaffectation.
   * Visible dans l'historique ; le ticket n'appartient plus à l'agent.
   */
  async refuseJob(
    organizationId: string,
    id: string,
    actor: { userId: string; name: string },
    reason?: string,
  ) {
    const ticket = await this.getForAgent(organizationId, actor.userId, id);
    assertAgentRefuseStatus(ticket.status);

    const message = reason?.trim()
      ? `Mission refusée par l'agent : ${reason.trim()}`
      : 'Mission refusée par l\'agent';

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id },
        data: {
          status: MaintenanceTicketStatus.OPEN,
          assignedToId: null,
          assignedToName: null,
        },
      });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          organizationId,
          type: MaintenanceEventType.STATUS_CHANGED,
          message,
          actorId: actor.userId,
          actorName: actor.name,
        },
      });
    });

    await this.notifications.notifyOrganizationStaff({
      organizationId,
      type: NotificationType.MAINTENANCE_ASSIGNED,
      title: 'Mission refusée',
      message: `${ticket.title} — à réassigner`,
      data: { ticketId: id },
    });

    return this.get(organizationId, id);
  }

  /** Transitions et commentaires de l'agent — refusés si l'intervention ne lui est pas assignée. */
  async startForAgent(organizationId: string, id: string, actor: { userId: string; name: string }) {
    const ticket = await this.getForAgent(organizationId, actor.userId, id);
    assertAgentStartStatus(ticket.status);
    return this.start(organizationId, id, actor);
  }

  async completeForAgent(organizationId: string, id: string, actor: { userId: string; name: string }) {
    const ticket = await this.getForAgent(organizationId, actor.userId, id);
    assertAgentCompleteStatus(ticket.status);
    return this.complete(organizationId, id, actor);
  }

  async closeForAgent(organizationId: string, id: string, actor: { userId: string; name: string }) {
    const ticket = await this.getForAgent(organizationId, actor.userId, id);
    assertAgentCloseStatus(ticket.status);
    if (ticket.status === MaintenanceTicketStatus.IN_PROGRESS) {
      await this.complete(organizationId, id, actor);
    }
    return this.close(organizationId, id, actor);
  }

  async addAgentNote(organizationId: string, id: string, message: string, actor: { userId: string; name: string }) {
    await this.getForAgent(organizationId, actor.userId, id);
    return this.addNote(organizationId, id, message, actor);
  }

  /** Agents de maintenance actifs de l'organisation (pour assignation propriétaire). */
  async listMaintenanceAgents(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        role: { in: ['AGENT', 'TECHNICIAN', 'MAINTENANCE_LEAD'] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return users.filter((u) => isMaintenanceAgent(u.role));
  }

  /** Photo avant / après. `scopeToAssignee` restreint l'action à l'agent assigné. */
  async attachPhoto(
    organizationId: string,
    id: string,
    phase: PhotoPhase,
    photo: PhotoRef,
    actor: { userId: string; name: string },
    opts?: { scopeToAssignee?: boolean },
  ) {
    const ticket = opts?.scopeToAssignee
      ? await this.getForAgent(organizationId, actor.userId, id)
      : await this.get(organizationId, id);
    if (ticket.status === MaintenanceTicketStatus.CLOSED) {
      throw new ValidationError('Ticket clôturé');
    }

    const photos = appendTicketPhoto(ticket.photos, phase, photo);

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id },
        data: { photos: photos as unknown as Prisma.InputJsonValue },
      });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          organizationId,
          type: MaintenanceEventType.PHOTO_ADDED,
          message: phase === 'BEFORE' ? 'Photo avant intervention ajoutée' : 'Photo après intervention ajoutée',
          actorId: actor.userId,
          actorName: actor.name,
        },
      });
    });

    return this.getForAgent(organizationId, actor.userId, id).catch(() => this.get(organizationId, id));
  }

  /** Compteurs du tableau de bord agent. */
  async agentStats(organizationId: string, userId: string) {
    const base = { organizationId, assignedToId: userId };
    const [assigned, inProgress, completed, closed, urgent] = await Promise.all([
      this.prisma.maintenanceTicket.count({
        where: { ...base, status: { in: [MaintenanceTicketStatus.OPEN, MaintenanceTicketStatus.ASSIGNED] } },
      }),
      this.prisma.maintenanceTicket.count({ where: { ...base, status: MaintenanceTicketStatus.IN_PROGRESS } }),
      this.prisma.maintenanceTicket.count({ where: { ...base, status: MaintenanceTicketStatus.COMPLETED } }),
      this.prisma.maintenanceTicket.count({ where: { ...base, status: MaintenanceTicketStatus.CLOSED } }),
      this.prisma.maintenanceTicket.count({
        where: {
          ...base,
          priority: { in: [MaintenancePriority.HIGH, MaintenancePriority.CRITICAL] },
          status: { notIn: [MaintenanceTicketStatus.CLOSED, MaintenanceTicketStatus.CANCELLED] },
        },
      }),
    ]);

    const next = await this.prisma.maintenanceTicket.findMany({
      where: {
        ...base,
        status: { notIn: [MaintenanceTicketStatus.CLOSED, MaintenanceTicketStatus.CANCELLED, MaintenanceTicketStatus.COMPLETED] },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 5,
      include: { apartment: { include: { building: true } }, tenant: true },
    });

    return {
      assigned,
      inProgress,
      completed,
      closed,
      urgent,
      openTotal: assigned + inProgress,
      upcoming: next,
    };
  }

  private toWebhookPayload(
    ticket: Prisma.MaintenanceTicketGetPayload<{ include: typeof ticketInclude }>,
    organizationName?: string,
  ) {
    return {
      ticketId: ticket.id,
      organizationName,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      apartmentLabel: ticket.apartment.label,
      buildingName: ticket.apartment.building?.name,
      tenantName: ticket.tenant ? `${ticket.tenant.firstName} ${ticket.tenant.lastName}` : null,
      tenantPhone: ticket.tenant?.phone ?? null,
      assignedToName: ticket.assignedToName
        ?? (ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : null),
    };
  }
}

function priorityLabel(p: MaintenancePriority) {
  const map: Record<MaintenancePriority, string> = {
    LOW: 'Normale',
    MEDIUM: 'Haute',
    HIGH: 'Urgent',
    CRITICAL: 'Urgent',
  };
  return map[p];
}

export { priorityLabel };
