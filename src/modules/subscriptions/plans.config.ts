import { SubscriptionPlan } from '@prisma/client';

/**
 * Matrice centrale des capacités. Toutes les vérifications (API, session, application mobile) en dérivent :
 * aucun écran ni aucune route ne doit tester un nom de plan directement.
 */
export const Capability = {
  /** Biens, logements, fiches locataires, contrats, loyers, dépenses, maintenance, documents, rapports. */
  CORE_MANAGEMENT: 'CORE_MANAGEMENT',
  /** Collaborateurs (agents, gérants, comptables), affectation à un agent, espace agent. */
  AGENT_MENU: 'AGENT_MENU',
  /** Accès des locataires à leur espace (création d'accès, espace locataire). */
  TENANT_MENU: 'TENANT_MENU',
  /** Fonctionnalités IA, soumises aux quotas. */
  AI: 'AI',
  /** Fonctionnalités premium réservées à Pro Max (aujourd'hui : uniquement l'IA). */
  PREMIUM: 'PREMIUM',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export const ALL_CAPABILITIES: readonly Capability[] = Object.values(Capability);

/**
 * Offres commerciales en vigueur. STARTER / ENTERPRISE n'existent plus que dans les données anciennes.
 * STANDARD est l'identifiant technique (enum en base) de l'offre d'essai, présentée sous le nom « Free ».
 */
export type CommercialPlan = 'STANDARD' | 'PRO' | 'PLUS' | 'PRO_MAX';
export type PaidPlan = Exclude<CommercialPlan, 'STANDARD'>;

export const PAID_PLANS: readonly PaidPlan[] = ['PRO', 'PLUS', 'PRO_MAX'];
export const COMMERCIAL_PLANS: readonly CommercialPlan[] = ['STANDARD', 'PRO', 'PLUS', 'PRO_MAX'];

const PLUS_CAPABILITIES: readonly Capability[] = [
  Capability.CORE_MANAGEMENT,
  Capability.AGENT_MENU,
  Capability.TENANT_MENU,
];

export const PLAN_CAPABILITIES: Record<CommercialPlan, readonly Capability[]> = {
  /** Free : les droits de Plus pendant l'essai ; l'IA reste réservée à Pro Max. */
  STANDARD: PLUS_CAPABILITIES,
  PRO: [Capability.CORE_MANAGEMENT],
  PLUS: PLUS_CAPABILITIES,
  PRO_MAX: [
    Capability.CORE_MANAGEMENT,
    Capability.AGENT_MENU,
    Capability.TENANT_MENU,
    Capability.AI,
    Capability.PREMIUM,
  ],
};

export const PLAN_LABELS: Record<CommercialPlan, string> = {
  STANDARD: 'Free',
  PRO: 'Pro',
  PLUS: 'Plus',
  PRO_MAX: 'Pro Max',
};

/** Essai Free : exactement 48 heures à partir de la création du compte (horloge serveur). */
export const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;

/**
 * Limites par offre. null = aucune limite appliquée tant que la valeur n'est pas décidée.
 * Free reprend les limites de Plus (l'essai donne les capacités de Plus).
 */
export interface PlanLimits {
  maxApartments: number | null;
  maxUsers: number | null;
}

const PLUS_LIMITS: PlanLimits = { maxApartments: null, maxUsers: null };

export const PLAN_LIMITS: Record<CommercialPlan, PlanLimits> = {
  STANDARD: PLUS_LIMITS,
  PRO: { maxApartments: null, maxUsers: null },
  PLUS: PLUS_LIMITS,
  PRO_MAX: { maxApartments: null, maxUsers: null },
};

/** Fournisseurs considérés comme « ancien modèle » (comptes antérieurs à ces offres). */
export const LEGACY_PROVIDERS = new Set(['manual', 'legacy']);

/**
 * Offre effective d'un abonnement enregistré.
 * Règle de transition validée : un compte de l'ancien modèle bénéficie de Pro Max jusqu'à son échéance actuelle.
 */
export function effectivePlan(plan: SubscriptionPlan, paymentProvider: string): CommercialPlan {
  if (LEGACY_PROVIDERS.has(paymentProvider)) return 'PRO_MAX';
  switch (plan) {
    case SubscriptionPlan.STANDARD:
    case SubscriptionPlan.PRO:
    case SubscriptionPlan.PLUS:
    case SubscriptionPlan.PRO_MAX:
      return plan;
    default:
      return 'PRO_MAX';
  }
}

export function planHas(plan: CommercialPlan, capability: Capability): boolean {
  return PLAN_CAPABILITIES[plan].includes(capability);
}

/** Offre payante la moins chère qui inclut une capacité. */
export function lowestPlanWith(capability: Capability): PaidPlan {
  return PAID_PLANS.find((p) => planHas(p, capability)) ?? 'PRO_MAX';
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === 'string' && (PAID_PLANS as readonly string[]).includes(value);
}
