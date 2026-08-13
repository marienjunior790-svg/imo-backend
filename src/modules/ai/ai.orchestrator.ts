import { LeaseStatus, UserRole } from '@prisma/client';
import { env, isWhatsAppConfigured } from '../../config/env.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { isValidWhatsAppPhone, normalizePhoneE164 } from '../../shared/utils/phone.util.js';
import type { AiActionHint } from './ai.fallback.js';
import type { AiMemoryService } from './ai.memory.service.js';
import {
  createPendingAction,
  type PendingActionPayload,
} from './ai.pending-actions.js';
import type { AiToolsService } from './ai.tools.js';

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface AiPlanStep {
  id: string;
  label: string;
  status: PlanStepStatus;
}

export interface BatchReminderDraftItem {
  tenantId: string;
  tenantName: string;
  recipientUserId?: string;
  toPhone?: string;
  body: string;
  subject?: string;
  channel: 'IN_APP' | 'WHATSAPP';
}

export interface PaymentReminderPendingHint {
  id: string;
  type: string;
  title: string;
  summary: string;
  payload: PendingActionPayload;
}

export interface PaymentReminderPlanResult {
  reply: string;
  steps: AiPlanStep[];
  pendingAction?: PaymentReminderPendingHint;
  actions: AiActionHint[];
  toolsUsed: string[];
  planSummary?: string;
}

export interface PaymentReminderPlanDeps {
  organizationId: string;
  userId: string;
  role: UserRole;
  tools: AiToolsService;
  prisma: PrismaService;
  memory?: AiMemoryService;
}

type OutstandingItem = {
  tenantId: string;
  tenantName: string;
  remainingXaf: number;
  period: string;
};

function normalizeAiQuery(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'")
    .trim();
}

/**
 * Multi-step intent: impayés + (contrat|bail) + (relance|prépare|prévenir).
 * Ex. « Trouve les locataires qui ont des impayés, vérifie leurs contrats et prépare les relances. »
 */
export function detectPaymentReminderPlan(message: string): boolean {
  const q = normalizeAiQuery(message);
  const hasUnpaid =
    q.includes('impay') ||
    q.includes('retard') ||
    (q.includes('pas') && q.includes('pay')) ||
    (q.includes('solde') && (q.includes('du') || q.includes('ouvert')));
  const hasContract = q.includes('contrat') || q.includes('bail') || q.includes('baux');
  const hasReminderPrep =
    q.includes('relanc') ||
    q.includes('prepar') ||
    q.includes('previ'); // prévenir / préviens / prévient
  return hasUnpaid && hasContract && hasReminderPrep;
}

function formatAmountXaf(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

export function buildReminderBody(input: {
  name: string;
  amountXaf: number;
  period: string;
}): string {
  return (
    `Bonjour ${input.name}, sauf erreur de notre part, un solde de loyer reste dû ` +
    `(${formatAmountXaf(input.amountXaf)} XAF, période ${input.period}). ` +
    `Merci de régulariser. — ITC`
  );
}

function uniqueTenantsFromOutstanding(items: OutstandingItem[]): Array<{
  tenantId: string;
  tenantName: string;
  remainingXaf: number;
  period: string;
}> {
  const byTenant = new Map<
    string,
    { tenantId: string; tenantName: string; remainingXaf: number; period: string }
  >();
  for (const row of items) {
    if (!row.tenantId) continue;
    const prev = byTenant.get(row.tenantId);
    if (!prev) {
      byTenant.set(row.tenantId, {
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        remainingXaf: Number(row.remainingXaf) || 0,
        period: row.period,
      });
    } else {
      prev.remainingXaf += Number(row.remainingXaf) || 0;
      // Keep earliest period already listed (rows are dueDate asc from tool).
    }
  }
  return [...byTenant.values()];
}

/**
 * Plan déterministe : impayés → contrats → brouillons de relance (sans envoi).
 */
export async function runPaymentReminderPlan(
  deps: PaymentReminderPlanDeps,
): Promise<PaymentReminderPlanResult> {
  const { organizationId, userId, role, tools, prisma } = deps;
  void deps.memory;

  const steps: AiPlanStep[] = [
    { id: 'A', label: 'Identifier les locataires avec impayés', status: 'pending' },
    { id: 'B', label: 'Vérifier les contrats (ACTIVE / DRAFT)', status: 'pending' },
    { id: 'C', label: 'Préparer les brouillons de relance', status: 'pending' },
  ];

  const toolsUsed: string[] = [];
  const actions: AiActionHint[] = [
    { label: 'Voir les impayés', route: '/payments?tab=unpaid' },
    { label: 'Voir les locataires', route: '/tenants' },
    { label: 'Voir les contrats', route: '/leases' },
  ];

  // ── Step A: outstanding payments (real Prisma via tool) ───────────────────
  steps[0].status = 'running';
  let outstandingItems: OutstandingItem[] = [];
  try {
    const outstanding = (await tools.execute(
      organizationId,
      'getOutstandingPayments',
      {},
      { userId, role },
    )) as {
      count?: number;
      items?: OutstandingItem[];
    };
    toolsUsed.push('getOutstandingPayments');
    outstandingItems = Array.isArray(outstanding?.items) ? outstanding.items : [];
    steps[0].status = 'done';
  } catch {
    steps[0].status = 'error';
    return {
      reply:
        'Impossible de charger les impayés depuis vos données. Réessayez ou ouvrez l’onglet Impayés.',
      steps,
      actions,
      toolsUsed,
      planSummary: 'Échec étape A (impayés)',
    };
  }

  const tenantsWithDebt = uniqueTenantsFromOutstanding(outstandingItems);
  const N = tenantsWithDebt.length;

  if (N === 0) {
    steps[1].status = 'skipped';
    steps[2].status = 'skipped';
    return {
      reply:
        'Terminé.\n' +
        '• 0 locataire(s) avec impayés\n' +
        '• Aucun contrat à vérifier\n' +
        '• 0 relance(s) préparée(s)\n' +
        'Aucun dossier concerné — aucune relance à préparer.',
      steps,
      actions,
      toolsUsed,
      planSummary: '0 locataire avec impayés — pas de relance',
    };
  }

  // ── Step B: leases for those tenants ──────────────────────────────────────
  steps[1].status = 'running';
  const tenantIds = tenantsWithDebt.map((t) => t.tenantId);
  let leases: Array<{
    id: string;
    tenantId: string;
    status: LeaseStatus;
  }> = [];
  try {
    leases = await prisma.lease.findMany({
      where: {
        organizationId,
        tenantId: { in: tenantIds },
        status: { in: [LeaseStatus.ACTIVE, LeaseStatus.DRAFT] },
      },
      select: { id: true, tenantId: true, status: true },
    });
    steps[1].status = 'done';
  } catch {
    steps[1].status = 'error';
    return {
      reply:
        `Terminé partiellement.\n` +
        `• ${N} locataire(s) avec impayés\n` +
        `• Impossible de vérifier les contrats — intervention requise.`,
      steps,
      actions,
      toolsUsed,
      planSummary: `Échec étape B — ${N} locataires avec impayés`,
    };
  }

  const leaseByTenant = new Map<string, { id: string; status: LeaseStatus }>();
  for (const lease of leases) {
    const existing = leaseByTenant.get(lease.tenantId);
    if (!existing) {
      leaseByTenant.set(lease.tenantId, { id: lease.id, status: lease.status });
      continue;
    }
    // Prefer ACTIVE over DRAFT
    if (existing.status !== LeaseStatus.ACTIVE && lease.status === LeaseStatus.ACTIVE) {
      leaseByTenant.set(lease.tenantId, { id: lease.id, status: lease.status });
    }
  }

  const withContract = tenantsWithDebt.filter((t) => leaseByTenant.has(t.tenantId));
  const withoutContract = tenantsWithDebt.filter((t) => !leaseByTenant.has(t.tenantId));
  const activeCount = withContract.filter(
    (t) => leaseByTenant.get(t.tenantId)?.status === LeaseStatus.ACTIVE,
  ).length;
  const draftOnlyCount = withContract.length - activeCount;
  const contractSummary =
    `${withContract.length}/${N} avec bail` +
    (activeCount ? ` (${activeCount} ACTIVE` : '') +
    (draftOnlyCount ? `${activeCount ? `, ` : ' ('}${draftOnlyCount} DRAFT seul` : '') +
    (withContract.length ? ')' : '') +
    (withoutContract.length ? ` · ${withoutContract.length} sans contrat` : '');

  // ── Step C: prepare drafts (no send) ──────────────────────────────────────
  steps[2].status = 'running';
  const tenantRows = await prisma.tenant.findMany({
    where: { organizationId, id: { in: tenantIds } },
    select: { id: true, firstName: true, lastName: true, userId: true, phone: true },
  });
  const tenantMeta = new Map(tenantRows.map((t) => [t.id, t]));

  const drafts: BatchReminderDraftItem[] = [];
  const interventions: Array<{ tenantId: string; tenantName: string; reason: string }> = [];

  for (const t of tenantsWithDebt) {
    const meta = tenantMeta.get(t.tenantId);
    const name = meta ? `${meta.firstName} ${meta.lastName}` : t.tenantName;
    const hasLease = leaseByTenant.has(t.tenantId);

    if (!hasLease) {
      interventions.push({
        tenantId: t.tenantId,
        tenantName: name,
        reason: 'pas de contrat ACTIVE/DRAFT',
      });
      continue;
    }

    const body = buildReminderBody({
      name,
      amountXaf: t.remainingXaf,
      period: t.period || 'n/c',
    });
    const subject = `Relance loyer — ${t.period || 'impayé'}`;

    if (meta?.userId) {
      drafts.push({
        tenantId: t.tenantId,
        tenantName: name,
        recipientUserId: meta.userId,
        body,
        subject,
        channel: 'IN_APP',
      });
      continue;
    }

    if (isWhatsAppConfigured && meta?.phone) {
      const toPhone = normalizePhoneE164(meta.phone, env.WHATSAPP_DEFAULT_COUNTRY_CODE);
      if (toPhone && isValidWhatsAppPhone(toPhone)) {
        drafts.push({
          tenantId: t.tenantId,
          tenantName: name,
          toPhone,
          body,
          subject,
          channel: 'WHATSAPP',
        });
        continue;
      }
    }

    const reasons: string[] = [];
    if (!meta?.userId) reasons.push('pas de userId portail');
    if (!meta?.phone) reasons.push('pas de téléphone');
    else if (!isWhatsAppConfigured) reasons.push('WhatsApp non configuré');
    else reasons.push('téléphone invalide pour WhatsApp');
    interventions.push({
      tenantId: t.tenantId,
      tenantName: name,
      reason: reasons.join(' / '),
    });
  }

  steps[2].status = 'done';

  const M = drafts.length;
  const K = interventions.length;

  let reply =
    `Terminé.\n` +
    `• ${N} locataire(s) avec impayés\n` +
    `• Contrats vérifiés : ${contractSummary}\n` +
    `• ${M} relance(s) préparée(s)\n` +
    `• ${K} dossier(s) nécessitent votre intervention` +
    (K
      ? ` (${interventions
          .slice(0, 3)
          .map((i) => `${i.tenantName}: ${i.reason}`)
          .join(' ; ')}${K > 3 ? '…' : ''})`
      : ' (ex: pas de userId portail / pas de téléphone)');

  let pendingAction: PaymentReminderPendingHint | undefined;

  if (M > 0) {
    reply += `\n\nJe vais envoyer une relance à ${M} locataire(s) concerné(s).`;
    const payload: PendingActionPayload = {
      items: drafts,
      summary: `Envoyer ${M} relance(s) locataire(s) (impayés)`,
    };
    const pending = await createPendingAction({
      organizationId,
      userId,
      type: 'SEND_BATCH_TENANT_REMINDERS',
      payload,
    });
    pendingAction = {
      id: pending.id,
      type: pending.type,
      title: 'Envoyer les relances',
      summary: pending.payload.summary ?? '',
      payload: pending.payload,
    };
  } else {
    reply +=
      '\n\nAucune relance prête à envoyer — complétez d’abord les dossiers en intervention (portail ou téléphone).';
  }

  return {
    reply,
    steps,
    pendingAction,
    actions,
    toolsUsed,
    planSummary: `${N} impayés · ${M} brouillons · ${K} interventions`,
  };
}
