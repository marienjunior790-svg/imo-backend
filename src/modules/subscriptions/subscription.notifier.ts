import { inject, injectable } from 'tsyringe';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { OWNER_ROLES } from '../../shared/auth/roles.js';
import { isMailerConfigured, sendMail } from '../../shared/mail/mail.service.js';

export interface OwnerNotice {
  organizationId: string;
  kind: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /** Envoi d'un e-mail en plus de la notification dans l'application. */
  email?: boolean;
}

/** Notifications d'abonnement destinées aux responsables de l'organisation (application + e-mail). */
@injectable()
export class SubscriptionNotifier {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async notifyOwners(notice: OwnerNotice): Promise<void> {
    const owners = await this.prisma.user.findMany({
      where: { organizationId: notice.organizationId, isActive: true, role: { in: OWNER_ROLES } },
      select: { id: true, email: true, firstName: true },
    });
    if (owners.length === 0) return;

    await this.prisma.notification.createMany({
      data: owners.map((o) => ({
        organizationId: notice.organizationId,
        userId: o.id,
        type: NotificationType.SYSTEM,
        title: notice.title,
        message: notice.message,
        data: { kind: notice.kind, target: 'subscription', ...notice.data } as Prisma.InputJsonValue,
      })),
    });

    if (!notice.email || !isMailerConfigured) return;
    await Promise.all(
      owners
        .filter((o) => o.email)
        .map((o) =>
          sendMail({
            to: o.email!,
            subject: `ITC — ${notice.title}`,
            text: `Bonjour ${o.firstName},\n\n${notice.message}\n\nOuvrez ITC, rubrique Paramètres › Abonnement.\n\n— L'équipe ITC`,
            html: `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(notice.title)}</h1>
<p style="line-height:1.5;color:#334155">Bonjour <strong>${escapeHtml(o.firstName)}</strong>,</p>
<p style="line-height:1.5;color:#334155">${escapeHtml(notice.message)}</p>
<p style="line-height:1.5;color:#334155">Ouvrez ITC, rubrique <strong>Paramètres › Abonnement</strong>.</p>
<p style="font-size:12px;color:#94a3b8">— L'équipe ITC</p></div>`,
          }).catch((err) => {
            console.warn('[subscription] e-mail non envoyé:', err instanceof Error ? err.message : err);
          }),
        ),
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
