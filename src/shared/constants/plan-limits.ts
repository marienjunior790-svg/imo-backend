import { SubscriptionPlan } from '@prisma/client';

/** Limites par plan SaaS IMMO-tec */
export interface PlanLimits {
  maxApartments: number;
  maxUsers: number;
  pdfLeaseContract: boolean;
  pdfPaymentReceipt: boolean;
  analytics: boolean;
  aiAssistant: boolean;
  label: string;
  priceXaf: number;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  STARTER: {
    label: 'Starter',
    priceXaf: 15_000,
    maxApartments: 10,
    maxUsers: 1,
    pdfLeaseContract: true,
    pdfPaymentReceipt: false,
    analytics: false,
    /** Débloqué pour tests / démonstration (hors gate Pro). */
    aiAssistant: true,
  },
  PRO: {
    label: 'Pro',
    priceXaf: 45_000,
    maxApartments: Infinity,
    maxUsers: 20,
    pdfLeaseContract: true,
    pdfPaymentReceipt: true,
    analytics: false,
    aiAssistant: true,
  },
  ENTERPRISE: {
    label: 'Enterprise',
    priceXaf: 120_000,
    maxApartments: Infinity,
    maxUsers: Infinity,
    pdfLeaseContract: true,
    pdfPaymentReceipt: true,
    analytics: true,
    aiAssistant: true,
  },
};

/** Jours de grâce après expiration avant suspension */
export const GRACE_PERIOD_DAYS = 7;

/** Durée essai / période par défaut à l'inscription (jours) */
export const DEFAULT_TRIAL_DAYS = 30;

/** Durée d'un cycle d'abonnement après renouvellement (jours) */
export const BILLING_CYCLE_DAYS = 30;

export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}
