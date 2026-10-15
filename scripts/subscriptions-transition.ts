/**
 * Transition des abonnements existants vers les offres Standard · Pro · Plus · Pro Max.
 *
 *   npx tsx scripts/subscriptions-transition.ts                 → rapport seul (aucune écriture)
 *   npx tsx scripts/subscriptions-transition.ts --apply         → applique la transition
 *   npx tsx scripts/subscriptions-transition.ts --rollback      → rapport du retour arrière
 *   npx tsx scripts/subscriptions-transition.ts --rollback --apply
 *
 * Règles validées :
 *  - un abonnement de l'ancien modèle encore valide devient Pro Max jusqu'à son échéance actuelle
 *    (statut et échéance inchangés, valeurs d'origine sauvegardées dans legacy*) ;
 *  - un abonnement déjà échu n'est pas modifié ;
 *  - aucune organisation n'est bloquée par le script ;
 *  - les propriétaires existants sont enregistrés comme ayant déjà bénéficié de l'essai (anti-abus).
 * Idempotent : un abonnement déjà migré (fournisseur « legacy ») est ignoré.
 *
 * Retour arrière : restaure les valeurs d'origine sauvegardées (legacy*) et convertit les abonnements créés
 * depuis la mise en service vers leur équivalent de l'ancien modèle (Standard → Starter, Plus → Pro,
 * Pro Max → Enterprise ; essai → actif jusqu'à sa fin, impayé → grâce, échu → suspendu), afin que la
 * migration SQL inverse puisse s'exécuter. Les abonnements Stripe en cours sont signalés : ils doivent
 * être résiliés ou remboursés dans Stripe, le script n'agit pas sur Stripe.
 */
import { PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

import { OWNER_ROLES } from '../src/shared/auth/roles.js';
import { computeAccess } from '../src/modules/subscriptions/access.rules.js';
import { LEGACY_PROVIDERS } from '../src/modules/subscriptions/plans.config.js';
import { trialClaimKeys } from '../src/modules/subscriptions/trial-claims.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const rollback = process.argv.includes('--rollback');

type Row = Record<string, string | number | boolean | null>;

async function transition(now: Date): Promise<Row[]> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, activeSubscription: true },
    orderBy: { createdAt: 'asc' },
  });
  const report: Row[] = [];

  for (const org of orgs) {
    const sub = org.activeSubscription;
    if (!sub) {
      report.push({ organisation: org.name, action: 'AUCUN_ABONNEMENT', detail: 'à traiter manuellement' });
      continue;
    }
    const base: Row = {
      organisation: org.name,
      planActuel: sub.plan,
      statut: sub.status,
      fournisseur: sub.paymentProvider,
      echeance: sub.expiresAt?.toISOString() ?? null,
    };
    if (!LEGACY_PROVIDERS.has(sub.paymentProvider)) {
      report.push({ ...base, action: 'DEJA_NOUVEAU_MODELE' });
      continue;
    }
    if (sub.paymentProvider === 'legacy') {
      report.push({ ...base, action: 'DEJA_MIGRE' });
      continue;
    }
    const state = computeAccess(sub, now, { renewalConfirmationMs: 0 });
    if (!state.entitled) {
      report.push({ ...base, action: 'ECHU_INCHANGE' });
      continue;
    }
    report.push({
      ...base,
      action: 'PRO_MAX_JUSQU_A_ECHEANCE',
      detail: sub.expiresAt ? null : 'aucune échéance enregistrée : Pro Max sans date de fin, à décider',
    });
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.updateMany({
        where: { id: sub.id, paymentProvider: sub.paymentProvider },
        data: {
          legacyPlan: sub.plan,
          legacyStatus: sub.status,
          legacyExpiresAt: sub.expiresAt,
          plan: SubscriptionPlan.PRO_MAX,
          paymentProvider: 'legacy',
        },
      });
      if (updated.count !== 1) return;
      await tx.organization.update({ where: { id: org.id }, data: { plan: SubscriptionPlan.PRO_MAX } });
      await tx.subscriptionEvent.create({
        data: {
          organizationId: org.id,
          subscriptionId: sub.id,
          type: 'MIGRATED',
          fromPlan: sub.plan,
          toPlan: SubscriptionPlan.PRO_MAX,
          fromStatus: sub.status,
          toStatus: sub.status,
          source: 'migration',
          details: { previousProvider: sub.paymentProvider, expiresAt: sub.expiresAt?.toISOString() ?? null },
        },
      });
    });
  }

  const owners = await prisma.user.findMany({
    where: { role: { in: OWNER_ROLES }, organizationId: { not: null }, email: { not: null } },
    select: { email: true, phone: true, organizationId: true },
  });
  const claims = owners.flatMap((o) =>
    trialClaimKeys(o.email!, o.phone).map((k) => ({ ...k, organizationId: o.organizationId, source: 'migration' })),
  );
  let inserted = 0;
  if (apply && claims.length) {
    inserted = (await prisma.trialClaim.createMany({ data: claims, skipDuplicates: true })).count;
  }
  report.push({ organisation: '—', action: 'ESSAIS_DEJA_UTILISES', detail: `${claims.length} clé(s), ${inserted} ajoutée(s)` });
  return report;
}

/** Équivalents dans l'ancien modèle, pour les abonnements créés après la mise en service. */
const OLD_PLAN: Partial<Record<SubscriptionPlan, SubscriptionPlan>> = {
  STANDARD: SubscriptionPlan.STARTER,
  PLUS: SubscriptionPlan.PRO,
  PRO_MAX: SubscriptionPlan.ENTERPRISE,
};
const OLD_STATUS: Partial<Record<SubscriptionStatus, SubscriptionStatus>> = {
  TRIALING: SubscriptionStatus.ACTIVE,
  PAST_DUE: SubscriptionStatus.GRACE_PERIOD,
  EXPIRED: SubscriptionStatus.SUSPENDED,
};
const NEW_PLANS = Object.keys(OLD_PLAN) as SubscriptionPlan[];
const NEW_STATUSES = Object.keys(OLD_STATUS) as SubscriptionStatus[];

async function revert(): Promise<Row[]> {
  const subs = await prisma.subscription.findMany({
    where: {
      OR: [{ legacyPlan: { not: null } }, { plan: { in: NEW_PLANS } }, { status: { in: NEW_STATUSES } }],
    },
    include: { organization: { select: { name: true } } },
  });
  const report: Row[] = [];

  for (const sub of subs) {
    const restore = sub.legacyPlan != null;
    const plan = restore ? sub.legacyPlan! : OLD_PLAN[sub.plan] ?? sub.plan;
    const status = restore
      ? sub.legacyStatus ?? SubscriptionStatus.ACTIVE
      : OLD_STATUS[sub.status] ?? sub.status;
    const expiresAt = restore ? sub.legacyExpiresAt : sub.expiresAt;
    report.push({
      organisation: sub.organization.name,
      action: restore ? 'RESTAURER' : 'CONVERTIR_ANCIEN_MODELE',
      plan: `${sub.plan} → ${plan}`,
      statut: `${sub.status} → ${status}`,
      detail:
        sub.paymentProvider === 'stripe' && sub.status !== SubscriptionStatus.CANCELLED
          ? 'abonnement Stripe : à résilier ou rembourser manuellement dans Stripe'
          : null,
    });
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          plan,
          status,
          expiresAt,
          paymentProvider: restore ? 'manual' : sub.paymentProvider,
          legacyPlan: null,
          legacyStatus: null,
          legacyExpiresAt: null,
        },
      });
      await tx.organization.updateMany({
        where: { id: sub.organizationId, subscriptionId: sub.id },
        data: { plan, subscriptionStatus: status, subscriptionExpiresAt: expiresAt },
      });
      await tx.subscriptionEvent.create({
        data: {
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          type: 'MIGRATION_ROLLED_BACK',
          fromPlan: sub.plan,
          toPlan: plan,
          fromStatus: sub.status,
          toStatus: status,
          source: 'migration',
        },
      });
    });
  }
  if (apply) {
    await prisma.organization.updateMany({
      where: { OR: [{ plan: { in: NEW_PLANS } }, { subscriptionStatus: { in: NEW_STATUSES } }], subscriptionId: null },
      data: { plan: SubscriptionPlan.STARTER, subscriptionStatus: SubscriptionStatus.ACTIVE },
    });
  }

  const claims = await prisma.trialClaim.count({ where: { source: 'migration' } });
  if (apply) await prisma.trialClaim.deleteMany({ where: { source: 'migration' } });
  report.push({ organisation: '—', action: 'SUPPRIMER_ESSAIS_MIGRATION', detail: `${claims} clé(s)` });
  return report;
}

async function main() {
  const now = new Date();
  const mode = `${rollback ? 'RETOUR ARRIÈRE' : 'TRANSITION'} — ${apply ? 'APPLICATION' : 'RAPPORT SEUL (aucune écriture)'}`;
  console.log(`\n${mode} — ${now.toISOString()}\n`);
  const report = rollback ? await revert() : await transition(now);
  console.table(report);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
