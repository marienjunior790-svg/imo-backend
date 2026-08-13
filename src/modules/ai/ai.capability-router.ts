/**
 * Phase J1 — Capability router.
 * Score utterance + session + pending → une capacité primaire.
 * Ne crée PAS de nouveaux tools : oriente vers propose* / howto / confirm / tools existants.
 */
import type { AiCapabilityId } from './ai.capabilities.js';
import { CAPABILITY_TO_TOOLS } from './ai.capabilities.js';
import { detectReferentialIntent } from './ai.context-manager.js';
import { isAppHowtoIntent } from './ai.app-guide.js';
import type { AiSessionEntities } from './ai.memory.service.js';
import { resolveKnowledgeClarification } from './ai.knowledge.js';

export type CapabilityRouteContext = {
  session?: AiSessionEntities | null;
  /** true si AiPendingAction ouverte pour cet user */
  hasPending?: boolean;
  pendingType?: string | null;
};

export type CapabilityRouteResult = {
  capability: AiCapabilityId | null;
  score: number;
  /** Si true : interdire buildLocalFallbackReply (dump patrimoine). */
  blockPortfolioFallback: boolean;
  /** Message de clarification quand on bloque le dump sans outil clair. */
  clarification?: string;
  /** Tools suggérés (existants) pour forcer un intent local. */
  suggestedTools: readonly string[];
};

function normalizeFr(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'")
    .trim();
}

const PROPOSE_INTENTS = new Set([
  'proposeGenerateLeasePdf',
  'proposeGeneratePaymentReceipt',
  'proposeGeneratePaymentNotice',
  'proposeCreateLease',
  'proposeSendTenantMessage',
  'proposeSendWhatsAppMessage',
  'proposeOutstandingReminderAutomation',
  'proposeLeaseExpiryReminders',
  'proposeMaintenanceTasksFromTickets',
  'proposeAnomalyActions',
]);

function lastWasPropose(session?: AiSessionEntities | null): boolean {
  if (!session) return false;
  if (session.lastIntent && PROPOSE_INTENTS.has(session.lastIntent)) return true;
  return (session.lastToolsUsed ?? []).some((t) => PROPOSE_INTENTS.has(t));
}

function pendingCapability(pendingType?: string | null): AiCapabilityId | null {
  if (!pendingType) return null;
  switch (pendingType) {
    case 'GENERATE_LEASE_PDF':
      return 'PDF_LEASE';
    case 'GENERATE_PAYMENT_RECEIPT':
      return 'PDF_RECEIPT';
    case 'GENERATE_PAYMENT_NOTICE':
      return 'PDF_NOTICE';
    case 'CREATE_LEASE':
      return 'LEASE_CREATE';
    case 'SEND_TENANT_MESSAGE':
      return 'MSG_INAPP';
    case 'SEND_WHATSAPP_MESSAGE':
      return 'MSG_WHATSAPP';
    case 'APPROVE_AUTOMATION_RUN':
      return 'AUTOMATION';
    default:
      return 'CONFIRM_PENDING';
  }
}

function scoreUtterance(q: string): Array<{ id: AiCapabilityId; score: number }> {
  const scores: Array<{ id: AiCapabilityId; score: number }> = [];

  const bump = (id: AiCapabilityId, n: number) => {
    const row = scores.find((s) => s.id === id);
    if (row) row.score += n;
    else scores.push({ id, score: n });
  };

  if (
    (q.includes('contrat') || q.includes('bail')) &&
    (q.includes('pdf') || q.includes('gener') || q.includes('cree') || q.includes('creer'))
  ) {
    bump('PDF_LEASE', 8);
  }
  if (
    (q.includes('recu') || q.includes('quittance')) &&
    (q.includes('pdf') || q.includes('gener') || q.includes('cree') || q.includes('creer') || q.includes('paiement'))
  ) {
    bump('PDF_RECEIPT', 8);
  }
  if (q.includes('avis') && (q.includes('paiement') || q.includes('pdf') || q.includes('gener'))) {
    bump('PDF_NOTICE', 7);
  }
  if (
    (q.includes('whatsapp') || q.includes('wa ')) &&
    (q.includes('envoi') || q.includes('envoie') || q.includes('message') || q.includes('relanc'))
  ) {
    bump('MSG_WHATSAPP', 8);
  }
  if (
    q.includes('message') &&
    q.includes('locataire') &&
    (q.includes('envoi') || q.includes('envoie') || q.includes('ecri') || q.includes('relanc'))
  ) {
    bump('MSG_INAPP', 6);
  }
  if (
    (q.includes('creer') || q.includes('cree') || q.includes('nouveau')) &&
    (q.includes('bail') || q.includes('contrat')) &&
    !q.includes('pdf')
  ) {
    bump('LEASE_CREATE', 7);
  }
  if (
    q.includes('automatis') ||
    (q.includes('relanc') && q.includes('impay') && q.includes('auto'))
  ) {
    bump('AUTOMATION', 7);
  }
  if (
    q.includes('document') ||
    q.includes('clause') ||
    (q.includes('compare') && q.includes('contrat')) ||
    q.includes('ocr')
  ) {
    bump('DOC_INTEL', 6);
  }
  if (
    q.includes('analyse') ||
    q.includes('synthese') ||
    q.includes('pourquoi baisse') ||
    q.includes('classement') ||
    q.includes('urgent')
  ) {
    bump('ANALYTICS', 5);
  }
  if (
    q.includes('impay') ||
    q.includes('vacant') ||
    q.includes('logement') ||
    q.includes('immeuble') ||
    q.includes('locataire') ||
    q.includes('occupation') ||
    q.includes('encaiss') ||
    q.includes('patrimoine') ||
    q.includes('parc')
  ) {
    bump('PORTFOLIO_READ', 4);
  }
  if (q.includes('maintenance') || q.includes('fuite') || q.includes('intervention') || q.includes('ticket')) {
    bump('MAINTENANCE', 5);
  }
  if (q.includes('retien') || q.includes('memorise') || q.includes('souvenir') || q.includes('oublie')) {
    bump('MEMORY', 6);
  }
  if (isAppHowtoIntent(q)) {
    bump('APP_HOWTO', 5);
  }

  return scores.sort((a, b) => b.score - a.score);
}

function clarificationForPending(pendingType?: string | null): string {
  const cap = pendingCapability(pendingType);
  switch (cap) {
    case 'PDF_LEASE':
      return `Une génération de contrat PDF est en attente. Répondez « oui » / « confirme » pour créer le PDF, ou « annule ».`;
    case 'PDF_RECEIPT':
      return `Un reçu PDF est en attente. Répondez « oui » / « confirme » pour le générer, ou « annule ».`;
    case 'PDF_NOTICE':
      return `Un avis de paiement PDF est en attente. Répondez « oui » / « confirme », ou « annule ».`;
    case 'MSG_WHATSAPP':
      return `Un envoi WhatsApp est en attente. Répondez « oui » / « confirme » pour envoyer, ou « annule ».`;
    case 'MSG_INAPP':
      return `Un message locataire est en attente. Répondez « oui » / « confirme », ou « annule ».`;
    case 'LEASE_CREATE':
      return `Une création de bail est en attente. Répondez « oui » / « confirme », ou « annule ».`;
    case 'AUTOMATION':
      return `Une automatisation est en attente d’approbation. Répondez « oui » / « confirme », ou « annule ».`;
    default:
      return `Une action est en attente de confirmation. Répondez « oui » / « confirme » pour exécuter, ou « annule ».`;
  }
}

function clarificationForProposeSession(lastIntent?: string): string {
  if (lastIntent?.includes('LeasePdf') || lastIntent?.includes('LEASE')) {
    return `Souhaitez-vous confirmer la génération du contrat PDF ? Dites « oui » ou « confirme », ou précisez un autre bail.`;
  }
  if (lastIntent?.includes('Receipt') || lastIntent?.includes('RECEIPT')) {
    return `Souhaitez-vous confirmer le reçu PDF ? Dites « oui » ou « confirme ».`;
  }
  if (lastIntent?.includes('WhatsApp')) {
    return `Souhaitez-vous confirmer l’envoi WhatsApp ? Dites « oui » ou « confirme », ou « annule ».`;
  }
  return `Une proposition récente est peut-être encore ouverte. Dites « oui » pour confirmer, « annule », ou reformulez clairement (ex. « génère le contrat PDF de … »).`;
}

/**
 * Résout la capacité primaire + décide si le dump patrimoine est interdit.
 */
export function resolveCapabilityRoute(
  message: string,
  ctx: CapabilityRouteContext = {},
): CapabilityRouteResult {
  const q = normalizeFr(message);
  const ref = detectReferentialIntent(message);
  const compact = q.replace(/[!?.…,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const shortAmbiguous = compact.length > 0 && compact.length < 48;

  if (ref.wantsConfirmLast || ref.wantsCancelLast) {
    return {
      capability: 'CONFIRM_PENDING',
      score: 100,
      blockPortfolioFallback: true,
      clarification: ctx.hasPending
        ? undefined
        : 'Aucune action en attente. Proposez d’abord un PDF / envoi, puis confirmez.',
      suggestedTools: [],
    };
  }

  // Limites produit (OCR, WA média, …) — prioritaire sur le dump
  const knowledge = resolveKnowledgeClarification(message);
  if (knowledge) {
    return {
      capability: 'DOC_INTEL',
      score: 95,
      blockPortfolioFallback: true,
      clarification: knowledge,
      suggestedTools: CAPABILITY_TO_TOOLS.DOC_INTEL,
    };
  }

  const scored = scoreUtterance(q);
  let top = scored[0] ?? null;

  // Pending ouvert + message court / flou → rester sur CONFIRM, jamais patrimoine
  if (ctx.hasPending && (shortAmbiguous || !top || top.score < 5)) {
    const fromPending = pendingCapability(ctx.pendingType) ?? 'CONFIRM_PENDING';
    return {
      capability: fromPending,
      score: 90,
      blockPortfolioFallback: true,
      clarification: clarificationForPending(ctx.pendingType),
      suggestedTools: CAPABILITY_TO_TOOLS[fromPending] ?? [],
    };
  }

  // Session propose* récente + message court ambigu → pas de dump
  if (lastWasPropose(ctx.session) && shortAmbiguous && (!top || top.score < 5)) {
    return {
      capability: 'CONFIRM_PENDING',
      score: 70,
      blockPortfolioFallback: true,
      clarification: clarificationForProposeSession(ctx.session?.lastIntent),
      suggestedTools: [],
    };
  }

  if (!top || top.score < 3) {
    // Message flou sans pending : bloquer le dump si ça ressemble à une suite de conversation propose
    const block =
      lastWasPropose(ctx.session) ||
      (!!ctx.hasPending && shortAmbiguous);
    return {
      capability: null,
      score: top?.score ?? 0,
      blockPortfolioFallback: block,
      clarification: block ? clarificationForProposeSession(ctx.session?.lastIntent) : undefined,
      suggestedTools: [],
    };
  }

  return {
    capability: top.id,
    score: top.score,
    blockPortfolioFallback: top.id !== 'PORTFOLIO_READ' && top.id !== 'ANALYTICS',
    suggestedTools: CAPABILITY_TO_TOOLS[top.id] ?? [],
  };
}

/** Helper booléen pour les chemins chat. */
export function shouldBlockPortfolioFallback(
  message: string,
  ctx: CapabilityRouteContext = {},
): boolean {
  return resolveCapabilityRoute(message, ctx).blockPortfolioFallback;
}
