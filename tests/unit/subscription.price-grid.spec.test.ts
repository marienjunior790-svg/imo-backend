/**
 * Spécification commerciale : grille tarifaire officielle ITC (docs/abonnements-offres-et-tarifs.md).
 *
 * La grille est décidée mais pas encore autorisée à la vente : elle n'est PAS saisie dans
 * `pricing.config.ts`. Ces tests vérifient (1) que la configuration active ne l'anticipe pas et
 * (2) qu'une fois saisie, elle serait exposée exactement, sans recalcul ni tarif fictif.
 */
import { BillingPeriod } from '@prisma/client';
import { env } from '../../src/config/env.js';
import {
  Capability,
  COMMERCIAL_PLANS,
  CommercialPlan,
  PAID_PLANS,
  PaidPlan,
  PLAN_CAPABILITIES,
  PLAN_LABELS,
  TRIAL_DURATION_MS,
} from '../../src/modules/subscriptions/plans.config.js';
import { getOffer, listOffers, PRICES, purchasablePriceId } from '../../src/modules/subscriptions/pricing.config.js';

const OFFICIAL_GRID: Record<CommercialPlan, { label: string; monthly: number; annual: number | null }> = {
  STANDARD: { label: 'Free', monthly: 0, annual: null },
  PRO: { label: 'Pro', monthly: 45, annual: 800 },
  PLUS: { label: 'Plus', monthly: 122, annual: 1850 },
  PRO_MAX: { label: 'Pro Max', monthly: 245, annual: 3000 },
};
const CURRENCY = 'EUR';

function enterOfficialGrid() {
  for (const plan of PAID_PLANS) {
    PRICES[plan].MONTHLY = { amount: OFFICIAL_GRID[plan].monthly, currency: CURRENCY, annualNote: null };
    PRICES[plan].ANNUAL = { amount: OFFICIAL_GRID[plan].annual, currency: CURRENCY, annualNote: null };
  }
}

describe('Grille tarifaire officielle (EUR)', () => {
  it('quatre offres, dans l\'ordre et sous leur nom commercial', () => {
    expect(COMMERCIAL_PLANS).toEqual(['STANDARD', 'PRO', 'PLUS', 'PRO_MAX']);
    for (const plan of COMMERCIAL_PLANS) expect(PLAN_LABELS[plan]).toBe(OFFICIAL_GRID[plan].label);
  });

  it('accès principal de chaque offre conforme à la grille', () => {
    expect(PLAN_CAPABILITIES.STANDARD).toEqual(PLAN_CAPABILITIES.PLUS);
    expect(TRIAL_DURATION_MS).toBe(48 * 3600_000);
    expect(PLAN_CAPABILITIES.PRO).toEqual([Capability.CORE_MANAGEMENT]);
    expect([...PLAN_CAPABILITIES.PLUS].sort()).toEqual(
      [Capability.CORE_MANAGEMENT, Capability.AGENT_MENU, Capability.TENANT_MENU].sort(),
    );
    expect(PLAN_CAPABILITIES.PRO_MAX).toEqual(expect.arrayContaining([Capability.AI, Capability.PREMIUM]));
  });

  it('Free : 0 €, sans tarif annuel, jamais proposé à l\'achat', () => {
    expect(OFFICIAL_GRID.STANDARD).toEqual({ label: 'Free', monthly: 0, annual: null });
    expect(listOffers().some((o) => (o.plan as string) === 'STANDARD')).toBe(false);
  });

  it('les tarifs annuels sont des montants fixes, différents de 12 mensualités', () => {
    const twelveTimes = Object.fromEntries(PAID_PLANS.map((p) => [p, OFFICIAL_GRID[p].monthly * 12]));
    expect(twelveTimes).toEqual({ PRO: 540, PLUS: 1464, PRO_MAX: 2940 });
    for (const plan of PAID_PLANS) expect(OFFICIAL_GRID[plan].annual).not.toBe(twelveTimes[plan]);
  });

  it('décidée mais non configurée : la configuration active ne contient encore aucun tarif', () => {
    for (const offer of listOffers()) {
      expect(offer).toMatchObject({ amount: null, currency: null, available: false });
    }
  });

  describe('une fois la grille saisie (simulation locale, restaurée après chaque cas)', () => {
    const saved = JSON.parse(JSON.stringify(PRICES));
    const savedIds = { ...env };
    afterEach(() => {
      Object.assign(PRICES, JSON.parse(JSON.stringify(saved)));
      Object.assign(env, savedIds);
    });

    it.each(PAID_PLANS.flatMap((plan) => [
      [plan, BillingPeriod.MONTHLY] as const,
      [plan, BillingPeriod.ANNUAL] as const,
    ]))('%s %s : montant exact de la grille, en EUR', (plan: PaidPlan, period: BillingPeriod) => {
      enterOfficialGrid();
      const expected = period === BillingPeriod.MONTHLY ? OFFICIAL_GRID[plan].monthly : OFFICIAL_GRID[plan].annual;
      expect(getOffer(plan, period)).toMatchObject({ amount: expected, currency: CURRENCY, available: true });
    });

    it('sans identifiant de prix Stripe configuré, l\'offre reste non achetable malgré son montant', () => {
      enterOfficialGrid();
      env.STRIPE_PRICE_PRO_MONTHLY = undefined;
      env.STRIPE_PRICE_PRO_MAX_ANNUAL = '  ';
      expect(getOffer('PRO', BillingPeriod.MONTHLY)).toMatchObject({ amount: 45, available: false });
      expect(purchasablePriceId('PRO', BillingPeriod.MONTHLY)).toBeNull();
      expect(getOffer('PRO_MAX', BillingPeriod.ANNUAL)).toMatchObject({ amount: 3000, available: false });
      expect(getOffer('PLUS', BillingPeriod.ANNUAL)).toMatchObject({ amount: 1850, available: true });
    });
  });
});
