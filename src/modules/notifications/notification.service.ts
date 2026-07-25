import { inject, injectable } from 'tsyringe';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ORG_NOTIFY_ROLES } from '../../shared/auth/roles.js';

export interface CreateNotificationInput {
  organizationId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Limite modèle Notification : un seul `readAt` partagé.
 * Les lignes broadcast (userId=null) restent listables pour le staff, mais
 * markRead/markAllRead ne les touchent plus — éviter un « lu » global pour tous.
 * Un suivi lu par utilisateur sur broadcast nécessiterait une table de réception
 * (migration hors scope).
 */
@injectable()
export class NotificationService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(organizationId: string, userId: string, filter?: 'unread' | 'read') {
    const where = {
      organizationId,
      OR: [{ userId }, { userId: null }],
      ...(filter === 'unread' ? { readAt: null } : {}),
      ...(filter === 'read' ? { readAt: { not: null } } : {}),
    };

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Notifications strictement personnelles — locataires et agents de maintenance.
   * Double scope obligatoire : organizationId + userId (exclut les broadcasts).
   */
  async listPersonal(organizationId: string, userId: string, filter?: 'unread' | 'read') {
    return this.prisma.notification.findMany({
      where: {
        organizationId,
        userId,
        ...(filter === 'unread' ? { readAt: null } : {}),
        ...(filter === 'read' ? { readAt: { not: null } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Marque lue uniquement une notif personnelle exacte (userId + org) — jamais broadcast. */
  async markOwnRead(organizationId: string, userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.prisma.notification.findFirst({ where: { id, organizationId, userId } });
  }

  async markAllOwnRead(organizationId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Staff : marque lue uniquement les notifs personnelles (userId exact).
   * Les broadcasts (userId=null) ne sont pas mises à jour — pas de read state per-user.
   */
  async markRead(organizationId: string, userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.prisma.notification.findFirst({ where: { id, organizationId, userId } });
  }

  async markAllRead(organizationId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        organizationId,
        userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Notification personnelle ciblée (ex. assignation agent). */
  async notifyUser(input: CreateNotificationInput & { userId: string }) {
    return this.create({ ...input, userId: input.userId });
  }

  /** Notifie le propriétaire et les gestionnaires actifs de l'organisation */
  async notifyOrganizationStaff(input: Omit<CreateNotificationInput, 'userId'>) {
    const staff = await this.prisma.user.findMany({
      where: {
        organizationId: input.organizationId,
        isActive: true,
        role: { in: ORG_NOTIFY_ROLES },
      },
      select: { id: true },
    });

    if (staff.length === 0) {
      return this.create({ ...input, userId: null });
    }

    return this.prisma.notification.createMany({
      data: staff.map((u) => ({
        organizationId: input.organizationId,
        userId: u.id,
        type: input.type,
        title: input.title,
        message: input.message,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
  }
}
