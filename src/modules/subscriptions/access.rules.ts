import { BillingPeriod, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import {
  Capability,
  CommercialPlan,
  effectivePlan,
  LEGACY_PROVIDERS,
  PLAN_CAPABILITIES,
  PLAN_LIMITS,
  PlanLimits,
} from './plans.config.js';

/** Champs d'abonnement nécessaires au calcul des droits. */
export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  paymentProvider: string;
  billingPeriod: BillingPeriod | null;
  expiresAt: Date | null;
  gracePeriodEndsAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
}

export type AccessDenial =
  | 'TRIAL_EXPIRED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_CANCELLED';

export interface AccessState {
  organizationId: string;
  subscriptionId: string;
  plan: CommercialPlan;
  storedPlan: SubscriptionPlan;
  /** Statut effectif à l'instant du calcul (un essai échu est EXPIRED même avant mise à jour en base). */
  status: SubscriptionStatus;
  paymentProvider: string;
  billingPeriod: BillingPeriod | null;
  isTrial: boolean;
  isLegacy: boolean;
  entitled: boolean;
  denial: AccessDenial | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  /** Instant où les droits cessent (null = pas d'échéance connue). */
  accessEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
  capabilities: Capability[];
  limits: PlanLimits;
  serverTime: Date;
}

export interface AccessOptions {
  /** Délai de confirmation d'un renouvellement automatique Stripe après la fin de période. */
  renewalConfirmationMs: number;
}

function isBefore(now: Date, end: Date | null): boolean {
  return end != null && now.getTime() < end.getTime();
}

/**
 * Calcule les droits d'une organisation à l'instant `now` (horloge serveur).
 * Fonction pure : aucune lecture ni écriture, pour être testée aux bornes exactes.
 */
export function computeAccess(sub: SubscriptionRecord, now: Date, options: AccessOptions): AccessState {
  const isLegacy = LEGACY_PROVIDERS.has(sub.paymentProvider);
  const plan = effectivePlan(sub.plan, sub.paymentProvider);
  const isTrial =
    !isLegacy && (sub.status === SubscriptionStatus.TRIALING || sub.plan === SubscriptionPlan.STANDARD);

  let entitled = false;
  let denial: AccessDenial | null = null;
  let accessEndsAt: Date | null = null;
  let status = sub.status;

  if (isTrial) {
    accessEndsAt = sub.trialEndsAt ?? sub.expiresAt;
    entitled = sub.status === SubscriptionStatus.TRIALING && isBefore(now, accessEndsAt);
    if (!entitled) {
      denial = 'TRIAL_EXPIRED';
      status = SubscriptionStatus.EXPIRED;
    }
  } else if (isLegacy) {
    accessEndsAt =
      sub.status === SubscriptionStatus.GRACE_PERIOD ? sub.gracePeriodEndsAt ?? sub.expiresAt : sub.expiresAt;
    const open = sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.GRACE_PERIOD;
    entitled = open && (accessEndsAt == null || isBefore(now, accessEndsAt));
    if (!entitled) {
      denial = sub.status === SubscriptionStatus.CANCELLED ? 'SUBSCRIPTION_CANCELLED' : 'SUBSCRIPTION_EXPIRED';
      if (open) status = SubscriptionStatus.EXPIRED;
    }
  } else {
    accessEndsAt = sub.currentPeriodEnd ?? sub.expiresAt;
    switch (sub.status) {
      case SubscriptionStatus.ACTIVE: {
        const awaitsRenewal = sub.paymentProvider === 'stripe' && !sub.cancelAtPeriodEnd;
        const limit =
          accessEndsAt && awaitsRenewal
            ? new Date(accessEndsAt.getTime() + options.renewalConfirmationMs)
            : accessEndsAt;
        entitled = isBefore(now, limit);
        if (!entitled) {
          denial = 'SUBSCRIPTION_EXPIRED';
          status = SubscriptionStatus.EXPIRED;
        }
        break;
      }
      case SubscriptionStatus.PAST_DUE:
        entitled = isBefore(now, accessEndsAt);
        if (!entitled) denial = 'SUBSCRIPTION_PAST_DUE';
        break;
      case SubscriptionStatus.CANCELLED:
        entitled = isBefore(now, accessEndsAt);
        if (!entitled) denial = 'SUBSCRIPTION_CANCELLED';
        break;
      default:
        entitled = false;
        denial = 'SUBSCRIPTION_EXPIRED';
    }
  }

  return {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    plan,
    storedPlan: sub.plan,
    status,
    paymentProvider: sub.paymentProvider,
    billingPeriod: sub.billingPeriod,
    isTrial,
    isLegacy,
    entitled,
    denial,
    trialStartedAt: sub.trialStartedAt,
    trialEndsAt: isTrial ? accessEndsAt : sub.trialEndsAt,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    accessEndsAt,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    cancelledAt: sub.cancelledAt,
    capabilities: entitled ? [...PLAN_CAPABILITIES[plan]] : [],
    limits: PLAN_LIMITS[plan],
    serverTime: now,
  };
}

export const DENIAL_MESSAGES: Record<AccessDenial, string> = {
  TRIAL_EXPIRED:
    'Votre essai Free de 48 heures est terminé. Aucun paiement n\'a été prélevé. Choisissez une offre pour continuer à utiliser ITC — votre compte et vos données sont conservés.',
  SUBSCRIPTION_EXPIRED:
    'Votre abonnement a expiré. Renouvelez-le pour continuer à utiliser ITC — vos données sont conservées.',
  SUBSCRIPTION_PAST_DUE:
    'Le paiement de votre abonnement n\'a pas abouti. Mettez à jour votre moyen de paiement pour continuer — vos données sont conservées.',
  SUBSCRIPTION_CANCELLED:
    'Votre abonnement est résilié. Choisissez une offre pour continuer à utiliser ITC — vos données sont conservées.',
};
