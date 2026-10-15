import { BillingPeriod } from '@prisma/client';
import { env, isStripeConfigured } from '../../config/env.js';
import { PAID_PLANS, PaidPlan } from './plans.config.js';

/**
 * Grille tarifaire centrale.
 * Les montants restent null tant qu'ils ne sont pas validés commercialement : une offre sans montant,
 * sans devise ou sans identifiant de prix Stripe est présentée « bientôt disponible » et ne peut pas être achetée.
 * Le montant affiché doit être identique au prix configuré dans Stripe (qui reste la référence de facturation).
 */
export interface PriceSetting {
  amount: number | null;
  currency: string | null;
  /** Remise annuelle, uniquement si elle est décidée (texte affiché tel quel). */
  annualNote: string | null;
}

/**
 * Chaque période porte son propre montant : le prix annuel n'est jamais déduit du prix mensuel.
 * Les montants décidés commercialement ne sont saisis ici qu'avec l'autorisation de mise en vente.
 */
export const PRICES: Record<PaidPlan, Record<BillingPeriod, PriceSetting>> = {
  PRO: {
    MONTHLY: { amount: null, currency: null, annualNote: null },
    ANNUAL: { amount: null, currency: null, annualNote: null },
  },
  PLUS: {
    MONTHLY: { amount: null, currency: null, annualNote: null },
    ANNUAL: { amount: null, currency: null, annualNote: null },
  },
  PRO_MAX: {
    MONTHLY: { amount: null, currency: null, annualNote: null },
    ANNUAL: { amount: null, currency: null, annualNote: null },
  },
};

function stripePriceId(plan: PaidPlan, period: BillingPeriod): string | null {
  const ids: Record<PaidPlan, Record<BillingPeriod, string | undefined>> = {
    PRO: { MONTHLY: env.STRIPE_PRICE_PRO_MONTHLY, ANNUAL: env.STRIPE_PRICE_PRO_ANNUAL },
    PLUS: { MONTHLY: env.STRIPE_PRICE_PLUS_MONTHLY, ANNUAL: env.STRIPE_PRICE_PLUS_ANNUAL },
    PRO_MAX: { MONTHLY: env.STRIPE_PRICE_PRO_MAX_MONTHLY, ANNUAL: env.STRIPE_PRICE_PRO_MAX_ANNUAL },
  };
  return ids[plan][period]?.trim() || null;
}

export interface PriceOffer {
  plan: PaidPlan;
  period: BillingPeriod;
  amount: number | null;
  currency: string | null;
  annualNote: string | null;
  /** Renouvellement automatique à chaque échéance, résiliable à tout moment pour la fin de période. */
  renewal: 'AUTOMATIC';
  available: boolean;
}

export function listOffers(): PriceOffer[] {
  return PAID_PLANS.flatMap((plan) =>
    ([BillingPeriod.MONTHLY, BillingPeriod.ANNUAL] as const).map((period) => getOffer(plan, period)),
  );
}

export function getOffer(plan: PaidPlan, period: BillingPeriod): PriceOffer {
  const setting = PRICES[plan][period];
  const available =
    isStripeConfigured &&
    setting.amount != null &&
    setting.currency != null &&
    stripePriceId(plan, period) != null;
  return {
    plan,
    period,
    amount: setting.amount,
    currency: setting.currency,
    annualNote: period === BillingPeriod.ANNUAL ? setting.annualNote : null,
    renewal: 'AUTOMATIC',
    available,
  };
}

/** Identifiant de prix Stripe d'une offre achetable, sinon null. */
export function purchasablePriceId(plan: PaidPlan, period: BillingPeriod): string | null {
  return getOffer(plan, period).available ? stripePriceId(plan, period) : null;
}

/** Retrouve l'offre correspondant à un prix Stripe reçu dans un webhook. */
export function offerForStripePrice(priceId: string): { plan: PaidPlan; period: BillingPeriod } | null {
  for (const plan of PAID_PLANS) {
    for (const period of [BillingPeriod.MONTHLY, BillingPeriod.ANNUAL] as const) {
      if (stripePriceId(plan, period) === priceId) return { plan, period };
    }
  }
  return null;
}
