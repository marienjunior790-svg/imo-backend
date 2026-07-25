import { inject, injectable } from 'tsyringe';
import { SubscriptionPlan, SubscriptionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app.error.js';
import {
  BILLING_CYCLE_DAYS,
  DEFAULT_TRIAL_DAYS,
  getPlanLimits,
  GRACE_PERIOD_DAYS,
} from '../../shared/constants/plan-limits.js';
import { SubscriptionContext } from '../../shared/types/subscription.d.js';
import { isOrgAdminLevel } from '../../shared/auth/roles.js';
import { AutomationEmitter } from '../automation/automation.emitter.js';

export interface SubscriptionDto {
  id: string;
  organizationId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: Date;
  expiresAt: Date | null;
  gracePeriodEndsAt: Date | null;
  customerId: string | null;
  externalSubscriptionId: string | null;
  paymentProvider: string;
  limits: {
    maxApartments: number | null;
    maxUsers: number | null;
    pdfLeaseContract: boolean;
    pdfPaymentReceipt: boolean;
    analytics: boolean;
    aiAssistant: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

@injectable()
export class SubscriptionRepository {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  findByOrganizationId(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { activeSubscription: true },
    });
  }

  findSubscriptionById(id: string) {
    return this.prisma.subscription.findUnique({ where: { id } });
  }

  findUserProAccess(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { proAccessEnabled: true },
    });
  }

  async createForOrganization(organizationId: string, plan: SubscriptionPlan = SubscriptionPlan.STARTER) {
    const expiresAt = addDays(new Date(), DEFAULT_TRIAL_DAYS);

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          organizationId,
          plan,
          status: SubscriptionStatus.ACTIVE,
          expiresAt,
          paymentProvider: 'manual',
        },
      });

      await tx.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionId: subscription.id,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          plan,
          subscriptionExpiresAt: expiresAt,
        },
      });

      return subscription;
    });
  }

  async syncOrganizationCache(organizationId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) return;

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionId: sub.id,
        subscriptionStatus: sub.status,
        plan: sub.plan,
        subscriptionExpiresAt: sub.expiresAt,
      },
    });
  }

  updateSubscription(id: string, data: {
    plan?: SubscriptionPlan;
    status?: SubscriptionStatus;
    expiresAt?: Date | null;
    gracePeriodEndsAt?: Date | null;
  }) {
    return this.prisma.subscription.update({ where: { id }, data });
  }

  countApartments(organizationId: string) {
    return this.prisma.apartment.count({ where: { organizationId } });
  }

  countUsers(organizationId: string) {
    return this.prisma.user.count({ where: { organizationId, isActive: true } });
  }
}

@injectable()
export class SubscriptionService {
  constructor(
    @inject(SubscriptionRepository) private readonly repo: SubscriptionRepository,
    @inject(AutomationEmitter) private readonly automation: AutomationEmitter,
    @inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Crée l'abonnement Starter à l'inscription d'une organisation */
  createDefaultSubscription(organizationId: string) {
    return this.repo.createForOrganization(organizationId, SubscriptionPlan.STARTER);
  }

  /** Résout le contexte abonnement + synchronise les statuts expirés */
  async resolveAccessContext(organizationId: string): Promise<SubscriptionContext> {
    const org = await this.repo.findByOrganizationId(organizationId);
    if (!org) throw new NotFoundError('Organisation introuvable');

    let subscription = org.activeSubscription;

    // Créer un abonnement si manquant (organisations legacy)
    if (!subscription) {
      subscription = await this.repo.createForOrganization(organizationId, org.plan);
    }

    subscription = await this.applyExpirationRules(subscription.id);
    await this.repo.syncOrganizationCache(organizationId, subscription.id);

    const limits = getPlanLimits(subscription.plan);

    return {
      subscriptionId: subscription.id,
      organizationId,
      plan: subscription.plan,
      status: subscription.status,
      expiresAt: subscription.expiresAt,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt,
      limits: {
        maxApartments: serializeLimit(limits.maxApartments),
        maxUsers: serializeLimit(limits.maxUsers),
        pdfLeaseContract: limits.pdfLeaseContract,
        pdfPaymentReceipt: limits.pdfPaymentReceipt,
        analytics: limits.analytics,
        aiAssistant: limits.aiAssistant,
      },
    };
  }

  async getSubscription(organizationId: string): Promise<SubscriptionDto> {
    const ctx = await this.resolveAccessContext(organizationId);
    const sub = await this.repo.findSubscriptionById(ctx.subscriptionId!);
    if (!sub) throw new NotFoundError('Abonnement introuvable');

    return this.toDto(sub, ctx.limits);
  }

  async changePlan(organizationId: string, plan: SubscriptionPlan): Promise<SubscriptionDto> {
    const ctx = await this.resolveAccessContext(organizationId);
    const sub = await this.repo.findSubscriptionById(ctx.subscriptionId!);
    if (!sub) throw new NotFoundError('Abonnement introuvable');

    const expiresAt = addDays(new Date(), BILLING_CYCLE_DAYS);

    const updated = await this.repo.updateSubscription(sub.id, {
      plan,
      status: SubscriptionStatus.ACTIVE,
      expiresAt,
      gracePeriodEndsAt: null,
    });

    await this.repo.syncOrganizationCache(organizationId, updated.id);
    const limits = getPlanLimits(plan);
    return this.toDto(updated, {
      maxApartments: serializeLimit(limits.maxApartments),
      maxUsers: serializeLimit(limits.maxUsers),
      pdfLeaseContract: limits.pdfLeaseContract,
      pdfPaymentReceipt: limits.pdfPaymentReceipt,
      analytics: limits.analytics,
      aiAssistant: limits.aiAssistant,
    });
  }

  async cancel(organizationId: string): Promise<SubscriptionDto> {
    const ctx = await this.resolveAccessContext(organizationId);
    const updated = await this.repo.updateSubscription(ctx.subscriptionId!, {
      status: SubscriptionStatus.CANCELLED,
    });
    await this.repo.syncOrganizationCache(organizationId, updated.id);
    return this.getSubscription(organizationId);
  }

  async reactivate(organizationId: string, plan?: SubscriptionPlan): Promise<SubscriptionDto> {
    const ctx = await this.resolveAccessContext(organizationId);
    const targetPlan = plan ?? ctx.plan;
    const expiresAt = addDays(new Date(), BILLING_CYCLE_DAYS);

    const updated = await this.repo.updateSubscription(ctx.subscriptionId!, {
      plan: targetPlan,
      status: SubscriptionStatus.ACTIVE,
      expiresAt,
      gracePeriodEndsAt: null,
    });

    await this.repo.syncOrganizationCache(organizationId, updated.id);

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    this.automation.subscriptionReactivated({
      organizationId,
      organizationName: org?.name,
      plan: targetPlan,
      expiresAt,
    });

    return this.getSubscription(organizationId);
  }

  /** Vérifie la limite de biens avant création */
  async assertCanCreateApartment(organizationId: string): Promise<void> {
    const ctx = await this.resolveAccessContext(organizationId);
    const { PlanLimitError } = await import('../../shared/errors/subscription.error.js');

    if (ctx.limits.maxApartments == null) return;

    const count = await this.repo.countApartments(organizationId);
    if (count >= ctx.limits.maxApartments) {
      throw new PlanLimitError(
        `Limite atteinte : ${ctx.limits.maxApartments} biens max (plan ${ctx.plan})`,
        'maxApartments',
      );
    }
  }

  async assertCanAddUser(organizationId: string): Promise<void> {
    const ctx = await this.resolveAccessContext(organizationId);
    const { PlanLimitError } = await import('../../shared/errors/subscription.error.js');

    if (ctx.limits.maxUsers == null) return;

    const count = await this.repo.countUsers(organizationId);
    if (count >= ctx.limits.maxUsers) {
      throw new PlanLimitError(
        `Limite atteinte : ${ctx.limits.maxUsers} utilisateur(s) max (plan ${ctx.plan})`,
        'maxUsers',
      );
    }
  }

  async assertPdfLeaseAllowed(organizationId: string): Promise<void> {
    const ctx = await this.resolveAccessContext(organizationId);
    const { PlanLimitError } = await import('../../shared/errors/subscription.error.js');
    if (!ctx.limits.pdfLeaseContract) {
      throw new PlanLimitError('Génération PDF contrat non incluse dans votre plan', 'pdfLeaseContract');
    }
  }

  async assertPdfReceiptAllowed(organizationId: string): Promise<void> {
    const ctx = await this.resolveAccessContext(organizationId);
    const { PlanLimitError } = await import('../../shared/errors/subscription.error.js');
    if (!ctx.limits.pdfPaymentReceipt) {
      throw new PlanLimitError(
        'Quittances PDF réservées au plan Pro et Enterprise',
        'pdfPaymentReceipt',
      );
    }
  }

  /** Vérifie que l'utilisateur a l'option Pro activée par le propriétaire */
  async assertUserProAccess(
    userId: string,
    organizationId: string,
    role: UserRole,
  ): Promise<void> {
    if (isOrgAdminLevel(role)) return;

    const ctx = await this.resolveAccessContext(organizationId);
    if (!ctx.limits.aiAssistant && !ctx.limits.analytics) {
      const { PlanLimitError } = await import('../../shared/errors/subscription.error.js');
      throw new PlanLimitError(
        'Option Pro disponible à partir du plan Pro',
        'proAccess',
      );
    }

    const user = await this.repo.findUserProAccess(userId);

    if (!user?.proAccessEnabled) {
      throw new ForbiddenError(
        'Option Pro non activée pour votre compte. Contactez votre administrateur.',
        'PRO_ACCESS_DISABLED',
      );
    }
  }

  /** Transition automatique ACTIVE → GRACE_PERIOD → SUSPENDED */
  private async applyExpirationRules(subscriptionId: string) {
    const sub = await this.repo.findSubscriptionById(subscriptionId);
    if (!sub || !sub.expiresAt) return sub!;

    const now = new Date();

    if (
      sub.status === SubscriptionStatus.ACTIVE &&
      sub.expiresAt < now
    ) {
      return this.repo.updateSubscription(sub.id, {
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: addDays(now, GRACE_PERIOD_DAYS),
      });
    }

    if (
      sub.status === SubscriptionStatus.GRACE_PERIOD &&
      sub.gracePeriodEndsAt &&
      sub.gracePeriodEndsAt < now
    ) {
      return this.repo.updateSubscription(sub.id, {
        status: SubscriptionStatus.SUSPENDED,
      });
    }

    return sub;
  }

  private toDto(
    sub: NonNullable<Awaited<ReturnType<SubscriptionRepository['findSubscriptionById']>>>,
    limits: SubscriptionContext['limits'],
  ): SubscriptionDto {
    return {
      id: sub.id,
      organizationId: sub.organizationId,
      plan: sub.plan,
      status: sub.status,
      startedAt: sub.startedAt,
      expiresAt: sub.expiresAt,
      gracePeriodEndsAt: sub.gracePeriodEndsAt,
      customerId: sub.customerId,
      externalSubscriptionId: sub.externalSubscriptionId,
      paymentProvider: sub.paymentProvider,
      limits,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** null = illimité (JSON-safe, pas Infinity) */
function serializeLimit(value: number): number | null {
  return value === Infinity ? null : value;
}
