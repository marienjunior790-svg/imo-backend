import { inject, injectable } from 'tsyringe';
import { MessagingService } from '../../infrastructure/messaging/messaging.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { extendedPrisma } from '../../shared/utils/extended-prisma.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { env } from '../../config/env.js';
import { normalizePhoneE164 } from '../../shared/utils/phone.util.js';

@injectable()
export class NotificationCenterService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(MessagingService) private readonly messaging: MessagingService,
  ) {}

  private db() {
    return extendedPrisma(this.prisma);
  }

  async summary(organizationId: string, userId: string) {
    const [unreadNotifications, unreadMessages, pendingTasks, pendingReminders] = await Promise.all([
      this.prisma.notification.count({ where: { organizationId, userId, readAt: null } }),
      this.db().message.count({ where: { organizationId, recipientId: userId, readAt: null } }),
      this.db().staffTask.count({ where: { organizationId, assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      this.db().reminder.count({ where: { organizationId, status: 'PENDING' } }),
    ]);
    return { unreadNotifications, unreadMessages, pendingTasks, pendingReminders };
  }

  async listMessages(organizationId: string, userId: string) {
    return this.db().message.findMany({
      where: {
        organizationId,
        OR: [{ senderId: userId }, { recipientId: userId }, { recipientId: null }],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async sendMessage(organizationId: string, senderId: string, data: { recipientId?: string; subject?: string; body: string; threadId?: string }) {
    return this.db().message.create({
      data: {
        organizationId,
        senderId,
        recipientId: data.recipientId,
        subject: data.subject,
        body: data.body,
        threadId: data.threadId ?? `thread-${senderId}-${Date.now()}`,
        channel: 'IN_APP',
        deliveryStatus: 'DELIVERED',
      },
    });
  }

  /**
   * Envoi WhatsApp réel (Meta Cloud API) + persistance Message (channel=WHATSAPP).
   * En cas d’échec provider : enregistre une ligne FAILED puis relance l’erreur.
   */
  async sendWhatsAppMessage(
    organizationId: string,
    senderId: string,
    data: {
      tenantId: string;
      toPhone: string;
      body: string;
      subject?: string;
      recipientUserId?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: data.tenantId, organizationId },
      select: { id: true, userId: true, firstName: true, lastName: true, phone: true },
    });
    if (!tenant) throw new NotFoundError('Locataire introuvable');

    const toPhone =
      normalizePhoneE164(data.toPhone, env.WHATSAPP_DEFAULT_COUNTRY_CODE) ?? data.toPhone.trim();
    if (!toPhone) {
      throw new ValidationError('Numéro WhatsApp manquant ou invalide.');
    }

    const body = data.body?.trim();
    if (!body) throw new ValidationError('Corps du message WhatsApp manquant.');

    const recipientId = data.recipientUserId ?? tenant.userId ?? undefined;
    const threadId = `wa-${organizationId}-${tenant.id}`;

    try {
      const sent = await this.messaging.sendWhatsAppText({
        organizationId,
        toE164: toPhone,
        body,
      });

      const message = await this.db().message.create({
        data: {
          organizationId,
          senderId,
          recipientId,
          subject: data.subject ?? 'WhatsApp ITC',
          body,
          threadId,
          channel: 'WHATSAPP',
          deliveryStatus: 'SENT',
          providerMessageId: sent.providerMessageId,
          tenantId: tenant.id,
          toPhone,
        },
      });

      return { message, providerMessageId: sent.providerMessageId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Envoi WhatsApp impossible';
      try {
        await this.db().message.create({
          data: {
            organizationId,
            senderId,
            recipientId,
            subject: data.subject ?? 'WhatsApp ITC',
            body,
            threadId,
            channel: 'WHATSAPP',
            deliveryStatus: 'FAILED',
            error: errorMsg.slice(0, 2000),
            tenantId: tenant.id,
            toPhone,
          },
        });
      } catch {
        // Ne pas masquer l’erreur provider si la persistance FAILED échoue
      }
      throw err;
    }
  }

  async markMessageRead(organizationId: string, userId: string, messageId: string) {
    const msg = await this.db().message.findFirst({ where: { id: messageId, organizationId } });
    if (!msg) throw new NotFoundError('Message introuvable');
    return this.db().message.update({ where: { id: messageId }, data: { readAt: new Date() } });
  }

  async listReminders(organizationId: string) {
    return this.db().reminder.findMany({
      where: { organizationId },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });
  }

  async createReminder(organizationId: string, data: {
    type: string;
    title: string;
    message: string;
    targetUserId?: string;
    relatedType?: string;
    relatedId?: string;
    scheduledAt: string;
  }) {
    return this.db().reminder.create({
      data: {
        organizationId,
        type: data.type,
        title: data.title,
        message: data.message,
        targetUserId: data.targetUserId,
        relatedType: data.relatedType,
        relatedId: data.relatedId,
        scheduledAt: new Date(data.scheduledAt),
      },
    });
  }

  async sendReminder(organizationId: string, id: string) {
    const reminder = await this.db().reminder.findFirst({ where: { id, organizationId } });
    if (!reminder) throw new NotFoundError('Relance introuvable');
    return this.db().reminder.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  async listTasks(organizationId: string, userId: string) {
    return this.db().staffTask.findMany({
      where: {
        organizationId,
        OR: [{ assignedToId: userId }, { createdById: userId }, { assignedToId: null }],
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 100,
    });
  }

  async createTask(organizationId: string, createdById: string, data: { title: string; description?: string; assignedToId?: string; dueDate?: string }) {
    return this.db().staffTask.create({
      data: {
        organizationId,
        title: data.title,
        description: data.description,
        assignedToId: data.assignedToId,
        createdById,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
  }

  async completeTask(organizationId: string, id: string) {
    const task = await this.db().staffTask.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundError('Tâche introuvable');
    return this.db().staffTask.update({
      where: { id },
      data: { status: 'DONE', completedAt: new Date() },
    });
  }
}
