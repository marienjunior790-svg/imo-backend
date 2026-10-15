import { inject, injectable } from 'tsyringe';
import { PaymentStatus, LeaseStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { N8nWebhookService } from '../../infrastructure/automation/n8n.service.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { RentFollowUpService } from '../rent-followup/rent-followup.service.js';
import { AutomationEvent } from '../../infrastructure/automation/automation.events.js';

@injectable()
export class AutomationQueryService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Loyers à échéance dans N jours (rappel J-3) */
  async getPaymentsDueSoon(days = 3) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const until = new Date(now);
    until.setDate(until.getDate() + days);

    return this.prisma.payment.findMany({
      where: {
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        dueDate: { gte: now, lte: until },
      },
      include: {
        organization: { select: { id: true, name: true, phone: true, email: true } },
        lease: {
          include: {
            tenant: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
            apartment: { select: { id: true, label: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Loyers en retard */
  async getLatePayments() {
    return this.prisma.payment.findMany({
      where: { status: PaymentStatus.LATE },
      include: {
        organization: { select: { id: true, name: true, phone: true } },
        lease: {
          include: {
            tenant: { select: { firstName: true, lastName: true, phone: true } },
            apartment: { select: { label: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Contrats expirant dans N jours */
  async getLeasesExpiringSoon(days = 30) {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.lease.findMany({
      where: {
        status: LeaseStatus.ACTIVE,
        endDate: { gte: now, lte: until },
      },
      include: {
        organization: { select: { id: true, name: true, email: true } },
        tenant: { select: { firstName: true, lastName: true, phone: true, email: true } },
        apartment: { select: { label: true } },
      },
      orderBy: { endDate: 'asc' },
    });
  }

  /** Abonnements SaaS expirant dans N jours */
  async getSubscriptionsExpiringSoon(days = 7) {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        expiresAt: { gte: now, lte: until },
      },
      include: {
        organization: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  /** Organisations en période de grâce ou suspendues */
  async getSubscriptionsNeedingAttention() {
    return this.prisma.organization.findMany({
      where: {
        subscriptionStatus: {
          in: [
            SubscriptionStatus.GRACE_PERIOD,
            SubscriptionStatus.SUSPENDED,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.EXPIRED,
          ],
        },
      },
      include: {
        activeSubscription: true,
      },
    });
  }
}

@injectable()
export class AutomationJobService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(N8nWebhookService) private readonly n8n: N8nWebhookService,
    @inject(SubscriptionService) private readonly subscriptionService: SubscriptionService,
    @inject(RentFollowUpService) private readonly rentFollowUp: RentFollowUpService,
  ) {}

  /** Marque les paiements en retard + notifications + webhooks */
  async markLatePaymentsAndNotify(): Promise<{ marked: number; notified: number }> {
    const marked = await this.rentFollowUp.markLatePayments();
    return { marked, notified: marked };
  }

  /** Synchronise les statuts d'abonnement échus + émet webhooks */
  async syncSubscriptionStatuses(): Promise<{ expired: number }> {
    const orgs = await this.prisma.organization.findMany({
      where: { subscriptionId: { not: null } },
      select: { id: true, name: true, subscriptionStatus: true },
    });

    let expired = 0;
    for (const org of orgs) {
      const before = org.subscriptionStatus;
      const ctx = await this.subscriptionService.resolveAccessContext(org.id);
      if (before !== ctx.status && !ctx.entitled) {
        expired++;
        this.n8n.emit({
          event: AutomationEvent.SUBSCRIPTION_SUSPENDED,
          organizationId: org.id,
          organizationName: org.name,
          data: { plan: ctx.plan, status: ctx.status, accessEndsAt: ctx.accessEndsAt },
        });
      }
    }

    return { expired };
  }
}