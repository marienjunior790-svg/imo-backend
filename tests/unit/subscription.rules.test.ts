/**
 * Règles d'abonnement sans base de données : calcul des droits aux bornes exactes,
 * matrice des capacités, offres mensuelles / annuelles, anti-abus de l'essai, périodes de quota.
 */
import { BillingPeriod, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { computeAccess, SubscriptionRecord } from '../../src/modules/subscriptions/access.rules.js';
import {
  Capability,
  effectivePlan,
  lowestPlanWith,
  PLAN_CAPABILITIES,
  PLAN_LABELS,
  PLAN_LIMITS,
  TRIAL_DURATION_MS,
} from '../../src/modules/subscriptions/plans.config.js';
import {
  getOffer,
  listOffers,
  offerForStripePrice,
  PRICES,
  purchasablePriceId,
} from '../../src/modules/subscriptions/pricing.config.js';
import { env } from '../../src/config/env.js';
import { AI_QUOTAS, nextQuotaReset, quotaPeriodStart } from '../../src/modules/subscriptions/quotas.config.js';
import { normalizeEmailForTrial, trialClaimKeys } from '../../src/modules/subscriptions/trial-claims.js';
import { ManualClock } from '../../src/shared/time/clock.js';

const H = 60 * 60 * 1000;
const opts = { renewalConfirmationMs: 2 * H };
const created = new Date('2026-10-15T08:00:00.000Z');

function record(over: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    id: 'sub_1',
    organizationId: 'org_1',
    plan: SubscriptionPlan.STANDARD,
    status: SubscriptionStatus.TRIALING,
    paymentProvider: 'trial',
    billingPeriod: null,
    expiresAt: null,
    gracePeriodEndsAt: null,
    trialStartedAt: created,
    trialEndsAt: new Date(created.getTime() + TRIAL_DURATION_MS),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    ...over,
  };
}

describe('Essai Free de 48 heures (horloge contrôlée)', () => {
  const trial = record({});
  const clock = new ManualClock(created);

  it('dure exactement 48 heures (pas deux jours calendaires)', () => {
    expect(TRIAL_DURATION_MS).toBe(172_800_000);
    expect(trial.trialEndsAt!.toISOString()).toBe('2026-10-17T08:00:00.000Z');
  });

  it('s\'affiche sous le nom commercial Free (identifiant technique STANDARD)', () => {
    const s = computeAccess(trial, created, opts);
    expect(s.plan).toBe('STANDARD');
    expect(PLAN_LABELS[s.plan]).toBe('Free');
    expect(Object.values(PLAN_LABELS)).toEqual(['Free', 'Pro', 'Plus', 'Pro Max']);
  });

  it('47 h 59 min 59 s : droits de Plus (Agent, Locataire), sans IA', () => {
    clock.set(created.getTime() + 48 * H - 1000);
    const s = computeAccess(trial, clock.now(), opts);
    expect(s.entitled).toBe(true);
    expect(s.status).toBe(SubscriptionStatus.TRIALING);
    expect(s.capabilities).toEqual([...PLAN_CAPABILITIES.PLUS]);
    expect(s.capabilities).not.toContain(Capability.AI);
    expect(s.capabilities).not.toContain(Capability.PREMIUM);
  });

  it('48 h exactement : bloqué (TRIAL_EXPIRED)', () => {
    clock.set(created.getTime() + 48 * H);
    const s = computeAccess(trial, clock.now(), opts);
    expect(s.entitled).toBe(false);
    expect(s.denial).toBe('TRIAL_EXPIRED');
    expect(s.status).toBe(SubscriptionStatus.EXPIRED);
    expect(s.capabilities).toEqual([]);
  });

  it('48 h + 1 ms : bloqué', () => {
    clock.set(created.getTime() + 48 * H + 1);
    expect(computeAccess(trial, clock.now(), opts).entitled).toBe(false);
  });

  it('un essai refusé (déjà utilisé) n\'ouvre aucun droit', () => {
    const refused = record({ status: SubscriptionStatus.EXPIRED, trialEndsAt: created });
    expect(computeAccess(refused, created, opts).entitled).toBe(false);
  });
});

describe('Matrice des capacités', () => {
  it('Free (essai) = Plus : Agent et Locataire, sans IA ni premium', () => {
    expect(PLAN_CAPABILITIES.STANDARD).toEqual(PLAN_CAPABILITIES.PLUS);
    expect(PLAN_CAPABILITIES.STANDARD).not.toContain(Capability.AI);
    expect(PLAN_LIMITS.STANDARD).toEqual(PLAN_LIMITS.PLUS);
  });

  it('Pro : sans Agent, Locataire ni IA', () => {
    for (const c of [Capability.AGENT_MENU, Capability.TENANT_MENU, Capability.AI]) {
      expect(PLAN_CAPABILITIES.PRO).not.toContain(c);
    }
  });

  it('Pro : gestion essentielle seulement', () => {
    expect(PLAN_CAPABILITIES.PRO).toEqual([Capability.CORE_MANAGEMENT]);
  });

  it('Plus : Pro + Agent + Locataire, sans IA ni premium', () => {
    expect(PLAN_CAPABILITIES.PLUS).toEqual(
      expect.arrayContaining([Capability.CORE_MANAGEMENT, Capability.AGENT_MENU, Capability.TENANT_MENU]),
    );
    expect(PLAN_CAPABILITIES.PLUS).not.toContain(Capability.AI);
    expect(PLAN_CAPABILITIES.PLUS).not.toContain(Capability.PREMIUM);
  });

  it('Pro Max : toutes les capacités', () => {
    expect([...PLAN_CAPABILITIES.PRO_MAX].sort()).toEqual(Object.values(Capability).sort());
  });

  it('offre minimale proposée pour chaque capacité', () => {
    expect(lowestPlanWith(Capability.AGENT_MENU)).toBe('PLUS');
    expect(lowestPlanWith(Capability.TENANT_MENU)).toBe('PLUS');
    expect(lowestPlanWith(Capability.AI)).toBe('PRO_MAX');
  });
});

describe('Offres payantes : périodes, renouvellement, échecs', () => {
  const periodStart = new Date('2026-11-01T00:00:00.000Z');
  const periodEnd = new Date('2026-12-01T00:00:00.000Z');
  const paid = (over: Partial<SubscriptionRecord>) =>
    record({
      plan: SubscriptionPlan.PLUS,
      status: SubscriptionStatus.ACTIVE,
      paymentProvider: 'stripe',
      billingPeriod: BillingPeriod.MONTHLY,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      ...over,
    });
  const at = (ms: number) => new Date(periodEnd.getTime() + ms);

  it('actif pendant la période payée', () => {
    const s = computeAccess(paid({}), new Date('2026-11-15T00:00:00Z'), opts);
    expect(s.entitled).toBe(true);
    expect(s.capabilities).toEqual(PLAN_CAPABILITIES.PLUS);
  });

  it('renouvellement automatique : délai technique de confirmation, puis blocage sans paiement', () => {
    expect(computeAccess(paid({}), at(2 * H - 1), opts).entitled).toBe(true);
    const after = computeAccess(paid({}), at(2 * H), opts);
    expect(after.entitled).toBe(false);
    expect(after.denial).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('résiliation programmée : accès jusqu\'à la fin de période, sans délai supplémentaire', () => {
    const sub = paid({ cancelAtPeriodEnd: true });
    expect(computeAccess(sub, at(-1), opts).entitled).toBe(true);
    expect(computeAccess(sub, at(0), opts).entitled).toBe(false);
  });

  it('paiement échoué : accès jusqu\'à la fin de la période payée, puis blocage', () => {
    const sub = paid({ status: SubscriptionStatus.PAST_DUE });
    expect(computeAccess(sub, at(-1), opts).entitled).toBe(true);
    const after = computeAccess(sub, at(0), opts);
    expect(after.entitled).toBe(false);
    expect(after.denial).toBe('SUBSCRIPTION_PAST_DUE');
  });

  it('abonnement résilié : bloqué après la fin de période', () => {
    const sub = paid({ status: SubscriptionStatus.CANCELLED });
    expect(computeAccess(sub, at(-1), opts).entitled).toBe(true);
    expect(computeAccess(sub, at(0), opts).denial).toBe('SUBSCRIPTION_CANCELLED');
  });

  it('période offerte par l\'équipe ITC (admin) : pas de délai de renouvellement', () => {
    const sub = paid({ paymentProvider: 'admin', cancelAtPeriodEnd: true });
    expect(computeAccess(sub, at(0), opts).entitled).toBe(false);
  });
});

describe('Comptes existants (ancien modèle)', () => {
  const legacy = (over: Partial<SubscriptionRecord>) =>
    record({
      plan: SubscriptionPlan.STARTER,
      status: SubscriptionStatus.ACTIVE,
      paymentProvider: 'manual',
      trialStartedAt: null,
      trialEndsAt: null,
      expiresAt: new Date('2026-11-12T15:11:08.000Z'),
      ...over,
    });

  it('Pro Max jusqu\'à l\'échéance actuelle, quel que soit l\'ancien plan', () => {
    for (const plan of [SubscriptionPlan.STARTER, SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE]) {
      const s = computeAccess(legacy({ plan }), new Date('2026-11-12T15:11:07.999Z'), opts);
      expect(s.plan).toBe('PRO_MAX');
      expect(s.entitled).toBe(true);
      expect(s.isLegacy).toBe(true);
    }
  });

  it('bloqué à l\'échéance (pas de prolongation implicite)', () => {
    const s = computeAccess(legacy({}), new Date('2026-11-12T15:11:08.000Z'), opts);
    expect(s.entitled).toBe(false);
    expect(s.denial).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('effectivePlan : fournisseur legacy → Pro Max ; nouveaux plans inchangés', () => {
    expect(effectivePlan(SubscriptionPlan.STARTER, 'legacy')).toBe('PRO_MAX');
    expect(effectivePlan(SubscriptionPlan.PLUS, 'stripe')).toBe('PLUS');
  });
});

describe('Offres mensuelles et annuelles', () => {
  it('six offres distinctes (3 offres × 2 périodes)', () => {
    const offers = listOffers();
    expect(offers).toHaveLength(6);
    expect(new Set(offers.map((o) => `${o.plan}:${o.period}`)).size).toBe(6);
    expect(new Set(offers.map((o) => o.plan))).toEqual(new Set(['PRO', 'PLUS', 'PRO_MAX']));
  });

  it('chaque prix Stripe est rattaché à la bonne offre et à la bonne période', () => {
    expect(offerForStripePrice('price_test_plus_monthly')).toEqual({ plan: 'PLUS', period: 'MONTHLY' });
    expect(offerForStripePrice('price_test_plus_annual')).toEqual({ plan: 'PLUS', period: 'ANNUAL' });
    expect(offerForStripePrice('price_test_pro_max_annual')).toEqual({ plan: 'PRO_MAX', period: 'ANNUAL' });
    expect(offerForStripePrice('price_inconnu')).toBeNull();
  });

  it('aucun prix inventé : sans montant validé, l\'offre n\'est pas achetable', () => {
    for (const offer of listOffers()) {
      expect(offer.amount).toBeNull();
      expect(offer.currency).toBeNull();
      expect(offer.available).toBe(false);
    }
    expect(purchasablePriceId('PRO', BillingPeriod.MONTHLY)).toBeNull();
    expect(getOffer('PRO_MAX', BillingPeriod.ANNUAL).renewal).toBe('AUTOMATIC');
  });

  describe('une fois des montants saisis (valeurs de test, restaurées après chaque cas)', () => {
    const saved = JSON.parse(JSON.stringify(PRICES));
    const savedStripeId = env.STRIPE_PRICE_PLUS_ANNUAL;
    afterEach(() => {
      Object.assign(PRICES, JSON.parse(JSON.stringify(saved)));
      env.STRIPE_PRICE_PLUS_ANNUAL = savedStripeId;
    });

    it('le montant affiché est exactement celui saisi ; l\'annuel n\'est jamais déduit du mensuel', () => {
      PRICES.PLUS.MONTHLY = { amount: 10, currency: 'EUR', annualNote: null };
      PRICES.PLUS.ANNUAL = { amount: 150, currency: 'EUR', annualNote: null };
      expect(getOffer('PLUS', BillingPeriod.MONTHLY)).toMatchObject({ amount: 10, currency: 'EUR', available: true });
      const annual = getOffer('PLUS', BillingPeriod.ANNUAL);
      expect(annual).toMatchObject({ amount: 150, currency: 'EUR', available: true });
      expect(annual.amount).not.toBe(10 * 12);
    });

    it('un montant sans prix Stripe n\'est pas achetable', () => {
      PRICES.PLUS.ANNUAL = { amount: 150, currency: 'EUR', annualNote: null };
      env.STRIPE_PRICE_PLUS_ANNUAL = undefined;
      expect(getOffer('PLUS', BillingPeriod.ANNUAL).available).toBe(false);
      expect(purchasablePriceId('PLUS', BillingPeriod.ANNUAL)).toBeNull();
    });

    it('un prix Stripe sans montant saisi n\'affiche aucun tarif fictif', () => {
      PRICES.PLUS.MONTHLY = { amount: 10, currency: 'EUR', annualNote: null };
      const pro = getOffer('PRO', BillingPeriod.MONTHLY);
      expect(pro.amount).toBeNull();
      expect(pro.currency).toBeNull();
      expect(pro.available).toBe(false);
    });
  });
});

describe('Anti-abus de l\'essai', () => {
  it('normalise les variantes d\'une même adresse', () => {
    expect(normalizeEmailForTrial('  Jean.Dupont+essai2@GoogleMail.com ')).toBe('jeandupont@gmail.com');
    expect(normalizeEmailForTrial('jean.dupont@itc.cg')).toBe('jean.dupont@itc.cg');
    expect(normalizeEmailForTrial('jean+x@itc.cg')).toBe('jean@itc.cg');
  });

  it('même empreinte pour un même téléphone écrit différemment ; jamais de valeur en clair', () => {
    const a = trialClaimKeys('a@itc.cg', '06 512 34 56');
    for (const variant of ['+242 06 512 34 56', '+242 6 512 34 56', '00242065123456', '242065123456']) {
      expect(trialClaimKeys('b@itc.cg', variant)[1]).toEqual(a[1]);
    }
    expect(trialClaimKeys('c@itc.cg', '06 512 34 57')[1]).not.toEqual(a[1]);
    expect(a[1].valueHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(a)).not.toContain('512');
  });
});

describe('Quotas IA', () => {
  it('aucun quota inventé ni multiplicateur : limites Pro Max non fixées', () => {
    expect(AI_QUOTAS.PRO_MAX).toEqual({ AI_MESSAGE: null, AI_IMAGE: null, AI_AUDIO: null });
    expect(AI_QUOTAS.PRO).toBeUndefined();
    expect(AI_QUOTAS.PLUS).toBeUndefined();
  });

  it('remise à zéro le 1er du mois à 00:00 heure de Brazzaville (UTC+1)', () => {
    expect(quotaPeriodStart(new Date('2026-10-31T22:59:59.999Z')).toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(quotaPeriodStart(new Date('2026-10-31T23:00:00.000Z')).toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(nextQuotaReset(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });
});
