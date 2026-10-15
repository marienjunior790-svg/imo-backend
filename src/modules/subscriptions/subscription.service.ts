import { inject, injectable } from 'tsyringe';
import {
  BillingPeriod,
  Prisma,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { BillingAccessError, PlanLimitError } from '../../shared/errors/subscription.error.js';
import { SubscriptionContext } from '../../shared/types/subscription.d.js';
import { isOrgAdminLevel, isPlatformAdmin, isTenant } from '../../shared/auth/roles.js';
import { clock } from '../../shared/time/clock.js';
import { env } from '../../config/env.js';
import { AutomationEmitter } from '../automation/automation.emitter.js';
import { AccessState, computeAccess, DENIAL_MESSAGES, SubscriptionRecord } from './access.rules.js';
import {
  Capability,
  CommercialPlan,
  lowestPlanWith,
  PaidPlan,
  PLAN_LABELS,
  TRIAL_DURATION_MS,
} from './plans.config.js';
import { listOffers } from './pricing.config.js';
import { trialClaimKeys } from './trial-claims.js';
import { SubscriptionNotifier } from './subscription.notifier.js';

type Tx = Prisma.TransactionClient;

export interface SubscriptionEventInput {
  type: string;
  source: 'stripe' | 'system' | 'migration' | 'admin' | 'signup';
  actorUserId?: string | null;
  externalRef?: string | null;
  details?: Record<string, unknown>;
}

/** Vue d'abonnement renvoyée à l'application (session et page Abonnement). */
export interface SubscriptionView {
  id: string;
  organizationId: string;
  plan: CommercialPlan;
  planLabel: string;
  storedPlan: SubscriptionPlan;
  status: SubscriptionStatus;
  paymentProvider: string;
  billingPeriod: BillingPeriod | null;
  isTrial: boolean;
  isLegacy: boolean;
  entitled: boolean;
  denial: string | null;
  denialMessage: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  accessEndsAt: Date | null;
  /** Ancien champ conservé pour les clients existants (= accessEndsAt). */
  expiresAt: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
  capabilities: Capability[];
  limits: { maxApartments: number | null; maxUsers: number | null };
  serverTime: Date;
}

const SUBSCRIPTION_SELECT = {
  id: true,
  organizationId: true,
  plan: true,
  status: true,
  paymentProvider: true,
  billingPeriod: true,
  expiresAt: true,
  gracePeriodEndsAt: true,
  trialStartedAt: true,
  trialEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  cancelledAt: true,
  legacyPlan: true,
  legacyStatus: true,
  legacyExpiresAt: true,
  customerId: true,
  externalSubscriptionId: true,
} satisfies Prisma.SubscriptionSelect;

type StoredSubscription = Prisma.SubscriptionGetPayload<{ select: typeof SUBSCRIPTION_SELECT }>;

const CAPABILITY_MESSAGES: Record<Capability, string> = {
  CORE_MANAGEMENT: 'Cette fonctionnalité nécessite un abonnement actif.',
  AGENT_MENU: 'Le menu Agent (collaborateurs et missions) est inclus à partir de l\'offre Plus.',
  TENANT_MENU: 'Le menu Locataire (espace et accès des locataires) est inclus à partir de l\'offre Plus.',
  AI: 'L\'assistant IA est inclus dans l\'offre Pro Max.',
  PREMIUM: 'Cette fonctionnalité premium est incluse dans l\'offre Pro Max.',
};

@injectable()
export class SubscriptionService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AutomationEmitter) private readonly automation: AutomationEmitter,
    @inject(SubscriptionNotifier) private readonly notifier: SubscriptionNotifier,
  ) {}

  // ─── Calcul des droits ─────────────────────────────────────────────────────

  /** Droits effectifs de l'organisation, calculés avec l'horloge serveur. */
  async getAccess(organizationId: string): Promise<AccessState> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        createdAt: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        activeSubscription: { select: SUBSCRIPTION_SELECT },
      },
    });
    if (!org) throw new NotFoundError('Organisation introuvable');

    const sub = org.activeSubscription ?? (await this.createMissingSubscription(organizationId, org.createdAt));
    const now = clock.now();
    const state = computeAccess(sub, now, {
      renewalConfirmationMs: env.SUBSCRIPTION_RENEWAL_CONFIRMATION_MINUTES * 60_000,
    });

    if (state.status !== sub.status) {
      await this.persistTransition(sub, state);
    }
    if (
      org.plan !== sub.plan ||
      org.subscriptionStatus !== state.status ||
      (org.subscriptionExpiresAt?.getTime() ?? null) !== (state.accessEndsAt?.getTime() ?? null)
    ) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionId: sub.id,
          plan: sub.plan,
          subscriptionStatus: state.status,
          subscriptionExpiresAt: state.accessEndsAt,
        },
      });
    }
    return state;
  }

  /** Contexte attaché aux requêtes (nom conservé pour les modules existants). */
  async resolveAccessContext(organizationId: string): Promise<SubscriptionContext> {
    const state = await this.getAccess(organizationId);
    return { ...state, expiresAt: state.accessEndsAt };
  }

  async getSubscription(organizationId: string): Promise<SubscriptionView> {
    return toView(await this.getAccess(organizationId));
  }

  /** Erreur à renvoyer pour un utilisateur donné, ou null si l'accès est permis. */
  denialFor(state: AccessState, role: UserRole | string, capability?: Capability): BillingAccessError | null {
    if (isPlatformAdmin(role)) return null;
    const ownerLevel = isOrgAdminLevel(role);
    const summary = summaryOf(state);

    if (!state.entitled) {
      if (!ownerLevel) {
        return new BillingAccessError(
          'ORGANIZATION_SUBSCRIPTION_INACTIVE',
          isTenant(role)
            ? 'Votre espace locataire est momentanément indisponible. Contactez votre bailleur.'
            : 'L\'abonnement de votre organisation n\'est plus actif. Contactez votre responsable.',
          { subscription: summary },
        );
      }
      const code = state.denial ?? 'SUBSCRIPTION_EXPIRED';
      return new BillingAccessError(code, DENIAL_MESSAGES[code], { subscription: summary });
    }

    if (capability && !state.capabilities.includes(capability)) {
      const requiredPlan = lowestPlanWith(capability);
      return new BillingAccessError(
        'PLAN_UPGRADE_REQUIRED',
        ownerLevel
          ? CAPABILITY_MESSAGES[capability]
          : 'Cette fonctionnalité n\'est pas incluse dans l\'offre de votre organisation.',
        { capability, requiredPlan, requiredPlanLabel: PLAN_LABELS[requiredPlan], subscription: summary },
      );
    }
    return null;
  }

  async assertAccess(organizationId: string, role: UserRole | string, capability?: Capability): Promise<AccessState> {
    const state = await this.getAccess(organizationId);
    const denial = this.denialFor(state, role, capability);
    if (denial) throw denial;
    return state;
  }

  async hasCapability(organizationId: string, capability: Capability): Promise<boolean> {
    const state = await this.getAccess(organizationId);
    return state.capabilities.includes(capability);
  }

  // ─── Limites ───────────────────────────────────────────────────────────────

  async assertCanCreateApartment(organizationId: string): Promise<void> {
    const state = await this.getAccess(organizationId);
    const max = state.limits.maxApartments;
    if (max == null) return;
    const count = await this.prisma.apartment.count({ where: { organizationId } });
    if (count >= max) {
      throw new PlanLimitError(
        `Limite atteinte : ${max} logement(s) au maximum avec l'offre ${PLAN_LABELS[state.plan]}`,
        'maxApartments',
      );
    }
  }

  async assertCanAddUser(organizationId: string): Promise<void> {
    const state = await this.getAccess(organizationId);
    const max = state.limits.maxUsers;
    if (max == null) return;
    const count = await this.prisma.user.count({
      where: { organizationId, isActive: true, role: { not: UserRole.TENANT } },
    });
    if (count >= max) {
      throw new PlanLimitError(
        `Limite atteinte : ${max} utilisateur(s) au maximum avec l'offre ${PLAN_LABELS[state.plan]}`,
        'maxUsers',
      );
    }
  }

  /** Les contrats PDF font partie de la gestion essentielle. */
  async assertPdfLeaseAllowed(organizationId: string): Promise<void> {
    await this.assertAccess(organizationId, UserRole.OWNER, Capability.CORE_MANAGEMENT);
  }

  /** Les quittances PDF font partie de la gestion essentielle. */
  async assertPdfReceiptAllowed(organizationId: string): Promise<void> {
    await this.assertAccess(organizationId, UserRole.OWNER, Capability.CORE_MANAGEMENT);
  }

  // ─── Essai Standard ────────────────────────────────────────────────────────

  /**
   * Démarre l'essai de 48 h dans la transaction de création du compte.
   * Un essai par e-mail normalisé et par téléphone : s'ils ont déjà servi, le compte est créé sans essai.
   */
  async startTrial(
    tx: Tx,
    input: { organizationId: string; startedAt: Date; email: string; phone?: string | null },
  ): Promise<{ granted: boolean; subscriptionId: string }> {
    const keys = trialClaimKeys(input.email, input.phone);
    const used = await tx.trialClaim.findFirst({
      where: { OR: keys.map((k) => ({ kind: k.kind, valueHash: k.valueHash })) },
      select: { id: true },
    });
    let granted = !used;
    if (granted) {
      const created = await tx.trialClaim.createMany({
        data: keys.map((k) => ({ ...k, organizationId: input.organizationId, source: 'signup' })),
        skipDuplicates: true,
      });
      granted = created.count === keys.length;
    }

    const trialEndsAt = granted ? new Date(input.startedAt.getTime() + TRIAL_DURATION_MS) : input.startedAt;
    const status = granted ? SubscriptionStatus.TRIALING : SubscriptionStatus.EXPIRED;
    const subscription = await tx.subscription.create({
      data: {
        organizationId: input.organizationId,
        plan: SubscriptionPlan.STANDARD,
        status,
        paymentProvider: 'trial',
        startedAt: input.startedAt,
        trialStartedAt: input.startedAt,
        trialEndsAt,
        expiresAt: trialEndsAt,
      },
    });
    await tx.organization.update({
      where: { id: input.organizationId },
      data: {
        subscriptionId: subscription.id,
        plan: SubscriptionPlan.STANDARD,
        subscriptionStatus: status,
        subscriptionExpiresAt: trialEndsAt,
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: subscription.id,
        type: granted ? 'TRIAL_STARTED' : 'TRIAL_REFUSED',
        toPlan: SubscriptionPlan.STANDARD,
        toStatus: status,
        source: 'signup',
        details: granted
          ? { trialStartedAt: input.startedAt.toISOString(), trialEndsAt: trialEndsAt.toISOString() }
          : { reason: 'TRIAL_ALREADY_USED' },
      },
    });
    return { granted, subscriptionId: subscription.id };
  }

  /**
   * Organisation sans abonnement (cas anormal) : essai rattaché à la date de création de l'organisation,
   * jamais à la date du jour, pour qu'aucun nouvel essai ne soit offert par ce biais.
   */
  private async createMissingSubscription(organizationId: string, orgCreatedAt: Date): Promise<StoredSubscription> {
    const trialEndsAt = new Date(orgCreatedAt.getTime() + TRIAL_DURATION_MS);
    const sub = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscription.create({
        data: {
          organizationId,
          plan: SubscriptionPlan.STANDARD,
          status: SubscriptionStatus.TRIALING,
          paymentProvider: 'trial',
          startedAt: orgCreatedAt,
          trialStartedAt: orgCreatedAt,
          trialEndsAt,
          expiresAt: trialEndsAt,
        },
        select: SUBSCRIPTION_SELECT,
      });
      await tx.organization.update({ where: { id: organizationId }, data: { subscriptionId: created.id } });
      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId: created.id,
          type: 'TRIAL_STARTED',
          toPlan: SubscriptionPlan.STANDARD,
          toStatus: SubscriptionStatus.TRIALING,
          source: 'system',
          details: { reason: 'MISSING_SUBSCRIPTION', trialEndsAt: trialEndsAt.toISOString() },
        },
      });
      return created;
    });
    return sub;
  }

  /** Enregistre un passage à l'état échu une seule fois (mise à jour conditionnelle). */
  private async persistTransition(sub: StoredSubscription, state: AccessState): Promise<void> {
    const legacyBackup =
      state.isLegacy && sub.legacyPlan == null
        ? { legacyPlan: sub.plan, legacyStatus: sub.status, legacyExpiresAt: sub.expiresAt }
        : {};
    const result = await this.prisma.subscription.updateMany({
      where: { id: sub.id, status: sub.status },
      data: { status: state.status, ...legacyBackup },
    });
    if (result.count !== 1) return;

    await this.recordEvent(sub.organizationId, sub.id, {
      type: state.isTrial ? 'TRIAL_EXPIRED' : 'EXPIRED',
      source: 'system',
      details: { accessEndsAt: state.accessEndsAt?.toISOString() ?? null },
    }, { fromPlan: sub.plan, toPlan: sub.plan, fromStatus: sub.status, toStatus: state.status });

    await this.notifier
      .notifyOwners({
        organizationId: sub.organizationId,
        kind: state.isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
        title: state.isTrial ? 'Essai terminé' : 'Abonnement expiré',
        message: DENIAL_MESSAGES[state.isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED'],
        email: true,
      })
      .catch((err) => console.warn('[subscription] notification non créée:', err?.message ?? err));
  }

  // ─── Historique ────────────────────────────────────────────────────────────

  async recordEvent(
    organizationId: string,
    subscriptionId: string | null,
    event: SubscriptionEventInput,
    change: {
      fromPlan?: SubscriptionPlan | null;
      toPlan?: SubscriptionPlan | null;
      fromStatus?: SubscriptionStatus | null;
      toStatus?: SubscriptionStatus | null;
    } = {},
    tx?: Tx,
  ): Promise<void> {
    await (tx ?? this.prisma).subscriptionEvent.create({
      data: {
        organizationId,
        subscriptionId,
        type: event.type,
        source: event.source,
        actorUserId: event.actorUserId ?? null,
        externalRef: event.externalRef ?? null,
        details: (event.details ?? undefined) as Prisma.InputJsonValue | undefined,
        fromPlan: change.fromPlan ?? null,
        toPlan: change.toPlan ?? null,
        fromStatus: change.fromStatus ?? null,
        toStatus: change.toStatus ?? null,
      },
    });
  }

  async getHistory(organizationId: string, take = 50) {
    return this.prisma.subscriptionEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        fromPlan: true,
        toPlan: true,
        fromStatus: true,
        toStatus: true,
        source: true,
        createdAt: true,
      },
    });
  }

  /** Page Abonnement : état, offres (sans montant tant qu'il n'est pas validé). */
  async getOverview(organizationId: string) {
    const subscription = await this.getSubscription(organizationId);
    return {
      subscription,
      offers: listOffers().map((o) => ({ ...o, planLabel: PLAN_LABELS[o.plan] })),
    };
  }

  // ─── Changements d'état (fournisseur de paiement, administrateur) ──────────

  /** Applique un nouvel état payant confirmé et l'inscrit dans l'historique. */
  async applyPaidState(
    organizationId: string,
    next: {
      plan: PaidPlan;
      status: SubscriptionStatus;
      billingPeriod: BillingPeriod | null;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      cancelledAt: Date | null;
      paymentProvider: 'stripe' | 'admin';
      customerId?: string | null;
      externalSubscriptionId?: string | null;
    },
    event: SubscriptionEventInput,
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { activeSubscription: { select: SUBSCRIPTION_SELECT } },
    });
    if (!org) throw new NotFoundError('Organisation introuvable');
    const before = org.activeSubscription;

    await this.prisma.$transaction(async (tx) => {
      const data = {
        plan: next.plan as SubscriptionPlan,
        status: next.status,
        billingPeriod: next.billingPeriod,
        currentPeriodStart: next.currentPeriodStart,
        currentPeriodEnd: next.currentPeriodEnd,
        expiresAt: next.currentPeriodEnd,
        gracePeriodEndsAt: null,
        cancelAtPeriodEnd: next.cancelAtPeriodEnd,
        cancelledAt: next.cancelledAt,
        paymentProvider: next.paymentProvider,
        ...(next.customerId !== undefined ? { customerId: next.customerId } : {}),
        ...(next.externalSubscriptionId !== undefined
          ? { externalSubscriptionId: next.externalSubscriptionId }
          : {}),
        ...(before && LEGACY_BACKUP_NEEDED(before)
          ? { legacyPlan: before.plan, legacyStatus: before.status, legacyExpiresAt: before.expiresAt }
          : {}),
      };
      const saved = before
        ? await tx.subscription.update({ where: { id: before.id }, data })
        : await tx.subscription.create({ data: { organizationId, ...data } });
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionId: saved.id,
          plan: saved.plan,
          subscriptionStatus: saved.status,
          subscriptionExpiresAt: saved.expiresAt,
        },
      });
      await this.recordEvent(
        organizationId,
        saved.id,
        event,
        {
          fromPlan: before?.plan ?? null,
          toPlan: saved.plan,
          fromStatus: before?.status ?? null,
          toStatus: saved.status,
        },
        tx,
      );
    });
  }

  /** Statut seul (paiement refusé, résiliation effective…), sans changer d'offre. */
  async applyStatus(
    organizationId: string,
    status: SubscriptionStatus,
    event: SubscriptionEventInput,
    extra: { cancelledAt?: Date | null; cancelAtPeriodEnd?: boolean } = {},
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { activeSubscription: { select: SUBSCRIPTION_SELECT } },
    });
    const sub = org?.activeSubscription;
    if (!sub) throw new NotFoundError('Abonnement introuvable');
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.subscription.update({
        where: { id: sub.id },
        data: { status, ...extra },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { subscriptionStatus: saved.status },
      });
      await this.recordEvent(
        organizationId,
        sub.id,
        event,
        { fromPlan: sub.plan, toPlan: sub.plan, fromStatus: sub.status, toStatus: status },
        tx,
      );
    });
  }

  /**
   * Geste commercial réservé à l'équipe ITC (administrateur plateforme) : offre une période sans paiement,
   * tracée dans l'historique. N'est jamais accessible au client.
   */
  async adminGrant(
    organizationId: string,
    input: { plan: PaidPlan; until: Date; reason: string },
    actorUserId: string,
  ): Promise<SubscriptionView> {
    const now = clock.now();
    if (input.until.getTime() <= now.getTime()) {
      throw new ValidationError('La date de fin doit être dans le futur');
    }
    await this.applyPaidState(
      organizationId,
      {
        plan: input.plan,
        status: SubscriptionStatus.ACTIVE,
        billingPeriod: null,
        currentPeriodStart: now,
        currentPeriodEnd: input.until,
        cancelAtPeriodEnd: true,
        cancelledAt: null,
        paymentProvider: 'admin',
      },
      { type: 'ADMIN_GRANT', source: 'admin', actorUserId, details: { reason: input.reason } },
    );
    return this.getSubscription(organizationId);
  }

  // ─── Tâches planifiées ─────────────────────────────────────────────────────

  /**
   * Passe à l'état échu les abonnements arrivés à terme et prévient les responsables.
   * Idempotent : la mise à jour conditionnelle empêche un double traitement.
   */
  async expireDue(): Promise<number> {
    const now = clock.now();
    const due = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD] },
        expiresAt: { lte: now },
        activeForOrganization: { isNot: null },
      },
      select: { organizationId: true },
      take: 500,
    });
    let expired = 0;
    for (const { organizationId } of due) {
      const state = await this.getAccess(organizationId);
      if (!state.entitled) expired++;
    }
    return expired;
  }

  /** Alertes avant la fin de l'essai (24 h et 2 h avant), une seule fois chacune. */
  async sendTrialWarnings(): Promise<number> {
    const now = clock.now();
    const thresholds = [
      { type: 'TRIAL_WARNING_24H', withinMs: 24 * 3600_000, label: '24 heures' },
      { type: 'TRIAL_WARNING_2H', withinMs: 2 * 3600_000, label: '2 heures' },
    ];
    let sent = 0;
    for (const t of thresholds) {
      const subs = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: { gt: now, lte: new Date(now.getTime() + t.withinMs) },
          activeForOrganization: { isNot: null },
        },
        select: { id: true, organizationId: true, trialEndsAt: true },
      });
      for (const sub of subs) {
        const already = await this.prisma.subscriptionEvent.findFirst({
          where: { subscriptionId: sub.id, type: t.type },
          select: { id: true },
        });
        if (already) continue;
        // 2 h avant la fin, l'alerte 24 h n'a plus de sens : on ne l'envoie pas en rattrapage.
        if (t.type === 'TRIAL_WARNING_24H' && sub.trialEndsAt!.getTime() - now.getTime() <= 2 * 3600_000) continue;
        await this.recordEvent(sub.organizationId, sub.id, {
          type: t.type,
          source: 'system',
          details: { trialEndsAt: sub.trialEndsAt!.toISOString() },
        });
        await this.notifier.notifyOwners({
          organizationId: sub.organizationId,
          kind: t.type,
          title: `Votre essai se termine dans moins de ${t.label}`,
          message: `Votre essai gratuit ITC se termine le ${formatDateTimeFr(sub.trialEndsAt!)}. Choisissez une offre pour continuer sans interruption — vos données sont conservées.`,
          data: { trialEndsAt: sub.trialEndsAt!.toISOString() },
          email: true,
        });
        sent++;
      }
    }
    return sent;
  }

  /** Événement d'automatisation (n8n) conservé pour les intégrations existantes. */
  emitReactivated(organizationId: string, organizationName: string | undefined, plan: string, expiresAt: Date | null) {
    this.automation.subscriptionReactivated({ organizationId, organizationName, plan, expiresAt });
  }
}

function LEGACY_BACKUP_NEEDED(sub: StoredSubscription): boolean {
  return (sub.paymentProvider === 'manual' || sub.paymentProvider === 'legacy') && sub.legacyPlan == null;
}

function summaryOf(state: AccessState) {
  return {
    plan: state.plan,
    planLabel: PLAN_LABELS[state.plan],
    status: state.status,
    isTrial: state.isTrial,
    accessEndsAt: state.accessEndsAt,
    serverTime: state.serverTime,
  };
}

export function toView(state: AccessState): SubscriptionView {
  return {
    id: state.subscriptionId,
    organizationId: state.organizationId,
    plan: state.plan,
    planLabel: PLAN_LABELS[state.plan],
    storedPlan: state.storedPlan,
    status: state.status,
    paymentProvider: state.paymentProvider,
    billingPeriod: state.billingPeriod,
    isTrial: state.isTrial,
    isLegacy: state.isLegacy,
    entitled: state.entitled,
    denial: state.denial,
    denialMessage: state.denial ? DENIAL_MESSAGES[state.denial] : null,
    trialStartedAt: state.trialStartedAt,
    trialEndsAt: state.trialEndsAt,
    currentPeriodStart: state.currentPeriodStart,
    currentPeriodEnd: state.currentPeriodEnd,
    accessEndsAt: state.accessEndsAt,
    expiresAt: state.accessEndsAt,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    cancelledAt: state.cancelledAt,
    capabilities: state.capabilities,
    limits: state.limits,
    serverTime: state.serverTime,
  };
}

function formatDateTimeFr(date: Date): string {
  return date.toLocaleString('fr-FR', {
    timeZone: 'Africa/Brazzaville',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
