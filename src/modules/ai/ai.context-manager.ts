import { injectable } from 'tsyringe';
import type { AiSessionEntities } from './ai.memory.service.js';

/** Flags de langage référentiel / conversationnel (FR). */
export type ReferentialIntentFlags = {
  wantsPreviousEntity: boolean;
  wantsLastMonth: boolean;
  wantsSameAction: boolean;
  wantsWhy: boolean;
  wantsExplainOtherwise: boolean;
  wantsCancelLast: boolean;
  /** Confirmer la dernière action propose* (oui / crée le PDF / vas-y). */
  wantsConfirmLast: boolean;
};

export type ResolvedEntityRefs = {
  tenantId?: string;
  tenantName?: string;
  buildingId?: string;
  apartmentId?: string;
  leaseId?: string;
  paymentId?: string;
  /** Une seule question de clarification si le référent est ambigu. */
  needsClarification?: string;
  usedSessionFallback: boolean;
};

export type RelativePeriodHint = {
  from?: Date;
  to?: Date;
  /** Raccourci pour filtres Prisma période loyer. */
  period?: 'last_month' | 'this_month';
};

export type ChatHistoryTurn = { role: 'user' | 'assistant'; content: string };

const CUID_RE = /\b(c[a-z0-9]{20,})\b/i;

function normalizeFr(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Détecte les intentions référentielles sans inventer d’IDs. */
export function detectReferentialIntent(message: string): ReferentialIntentFlags {
  const q = normalizeFr(message);

  const wantsPreviousEntity =
    /\bcelui[- ]?la\b/.test(q) ||
    /\bcelle[- ]?la\b/.test(q) ||
    /\bceux[- ]?la\b/.test(q) ||
    /\bcelui[- ]?ci\b/.test(q) ||
    /\ble precedent\b/.test(q) ||
    /\bla precedente\b/.test(q) ||
    /\bce locataire\b/.test(q) ||
    /\bcette locataire\b/.test(q) ||
    /\bce bail\b/.test(q) ||
    /\bce contrat\b/.test(q) ||
    /\bce paiement\b/.test(q) ||
    /\bce logement\b/.test(q) ||
    /\bcet appartement\b/.test(q) ||
    /\bcet immeuble\b/.test(q) ||
    /\bet celui\b/.test(q) ||
    /\bet celle\b/.test(q);

  const wantsLastMonth =
    q.includes('mois dernier') ||
    q.includes('du mois passe') ||
    q.includes('du mois precedent') ||
    q.includes('periode precedente');

  const wantsSameAction =
    q.includes('fais pareil') ||
    q.includes('fait pareil') ||
    q.includes('meme chose') ||
    q.includes('la meme chose') ||
    q.includes('pareil pour') ||
    q.includes('idem');

  const wantsWhy =
    /^(pourquoi|pour quoi)\b/.test(q.trim()) ||
    /\bpourquoi\s*\??\s*$/.test(q.trim()) ||
    q.trim() === 'pourquoi' ||
    q.trim() === 'pourquoi ?';

  const wantsExplainOtherwise =
    q.includes('explique autrement') ||
    q.includes('reformule') ||
    q.includes('dis autrement') ||
    q.includes('plus simplement');

  const wantsCancelLast =
    (q.includes('annule') || q.includes('annuler')) &&
    (q.includes('ce que tu viens') ||
      q.includes('la derniere action') ||
      q.includes('derniere action') ||
      q.includes('cette action') ||
      q.includes('la proposition') ||
      q.includes('ce que tu as propose') ||
      q.trim() === 'annule' ||
      q.trim() === 'annuler');

  // Confirm NL — court, sans inventer d’IDs (lié au pending via getLatestPendingForUser).
  const compact = q.replace(/[!?.…,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const wantsConfirmLast =
    !wantsCancelLast &&
    (compact === 'oui' ||
      compact === 'ok' ||
      compact === 'okey' ||
      compact === 'okay' ||
      compact === 'confirme' ||
      compact === 'confirmer' ||
      compact === 'je confirme' ||
      compact === 'vas-y' ||
      compact === 'vas y' ||
      compact === 'go' ||
      compact === 'd accord' ||
      compact === "d'accord" ||
      compact === 'valide' ||
      compact === 'valider' ||
      /\boui\b.*\b(cree|creer|genere|generer|pdf|contrat|recu|avis|envoie|envoyer)\b/.test(q) ||
      /\b(confirme|confirmer)\b.*\b(pdf|contrat|recu|avis|action|proposition)?\b/.test(q) ||
      /\b(cree|creer|genere|generer)\b.*\bpdf\b/.test(q) ||
      (compact.length <= 40 &&
        /\b(oui|ok)\b/.test(compact) &&
        /\b(pdf|contrat|recu|avis|cree|creer|genere)\b/.test(compact)));

  return {
    wantsPreviousEntity,
    wantsLastMonth,
    wantsSameAction,
    wantsWhy,
    wantsExplainOtherwise,
    wantsCancelLast,
    wantsConfirmLast,
  };
}

/** Périodes relatives simples (UTC month math). */
export function relativePeriod(message: string, now = new Date()): RelativePeriodHint {
  const q = normalizeFr(message);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11

  if (q.includes('mois dernier') || q.includes('mois passe') || q.includes('mois precedent')) {
    const last = new Date(Date.UTC(y, m - 1, 1));
    const from = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    const to = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { from, to, period: 'last_month' };
  }

  if (q.includes('ce mois') || q.includes('mois en cours') || q.includes('ce mois-ci') || q.includes('ce mois ci')) {
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    return { from, to, period: 'this_month' };
  }

  if (/\bdemain\b/.test(q)) {
    const tomorrow = new Date(Date.UTC(y, m, now.getUTCDate() + 1));
    const from = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate()));
    const to = new Date(
      Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 23, 59, 59, 999),
    );
    return { from, to };
  }

  return {};
}

function extractCuid(text: string): string | undefined {
  const m = text.match(CUID_RE);
  return m?.[1];
}

/**
 * Extrait un nom propre plausible depuis l’historique assistant (sans inventer d’ID).
 * Ne retourne que des noms déjà présents textuellement.
 */
export function extractNameHintsFromHistory(history?: ChatHistoryTurn[]): string | undefined {
  if (!history?.length) return undefined;
  const recent = history.slice(-4);
  for (let i = recent.length - 1; i >= 0; i--) {
    const turn = recent[i];
    if (turn.role !== 'assistant') continue;
    // « Locataire Jean Dupont » / « • Jean Dupont (… » / « à Jean Dupont »
    const m =
      turn.content.match(/(?:locataire|bail|contrat|message)\s+([A-ZÀ-Ÿ][\p{L}'-]+(?:\s+[A-ZÀ-Ÿ][\p{L}'-]+)?)/u) ||
      turn.content.match(/•\s*([A-ZÀ-Ÿ][\p{L}'-]+(?:\s+[A-ZÀ-Ÿ][\p{L}'-]+)?)\s*(?:\(|—|-)/u);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/**
 * Fusionne IDs/noms explicites du message avec repli session pour pronoms.
 * N’invente jamais d’ID : si référent demandé sans session → clarification.
 */
export function resolveEntitiesFromMessage(
  message: string,
  session: AiSessionEntities = {},
  history?: ChatHistoryTurn[],
): ResolvedEntityRefs {
  const flags = detectReferentialIntent(message);
  const cuid = extractCuid(message);
  const out: ResolvedEntityRefs = { usedSessionFallback: false };

  // CUID explicite dans le message — on le place selon le contexte lexical, sinon lease/payment générique.
  if (cuid) {
    const q = normalizeFr(message);
    if (q.includes('paiement') || q.includes('recu') || q.includes('quittance') || q.includes('avis')) {
      out.paymentId = cuid;
    } else if (q.includes('bail') || q.includes('contrat') || q.includes('lease')) {
      out.leaseId = cuid;
    } else if (q.includes('logement') || q.includes('appart')) {
      out.apartmentId = cuid;
    } else if (q.includes('immeuble') || q.includes('building')) {
      out.buildingId = cuid;
    } else if (q.includes('locataire') || q.includes('tenant')) {
      out.tenantId = cuid;
    } else {
      // Ambigu : ne pas inventer le type — laisser les tools spécialisés / clarification plus bas.
      out.paymentId = session.lastPaymentId === cuid ? cuid : undefined;
      out.leaseId = session.lastLeaseId === cuid ? cuid : undefined;
      out.tenantId = session.lastTenantId === cuid ? cuid : undefined;
      if (!out.paymentId && !out.leaseId && !out.tenantId) {
        // CUID nu : préférer payment/lease si session récente, sinon tenant
        if (session.lastPaymentId) out.paymentId = cuid;
        else if (session.lastLeaseId) out.leaseId = cuid;
        else out.tenantId = cuid;
      }
    }
  }

  const historyName = extractNameHintsFromHistory(history);
  if (historyName && !out.tenantName) {
    out.tenantName = historyName;
  }

  // Session name si présent
  if (session.lastTenantName && !out.tenantName) {
    out.tenantName = session.lastTenantName;
  }

  const needsEntity =
    flags.wantsPreviousEntity ||
    flags.wantsSameAction ||
    /\b(lui|elle|celui|celle|precedent)\b/.test(normalizeFr(message));

  if (needsEntity || flags.wantsPreviousEntity) {
    const hasAnySession =
      !!session.lastTenantId ||
      !!session.lastLeaseId ||
      !!session.lastPaymentId ||
      !!session.lastApartmentId ||
      !!session.lastBuildingId;

    if (!hasAnySession && !cuid && !out.tenantName) {
      out.needsClarification =
        'De quel élément parlez-vous (locataire, bail, paiement, logement) ? Précisez un nom ou un identifiant.';
      return out;
    }

    if (!out.tenantId && session.lastTenantId) {
      out.tenantId = session.lastTenantId;
      out.usedSessionFallback = true;
    }
    if (!out.leaseId && session.lastLeaseId) {
      out.leaseId = session.lastLeaseId;
      out.usedSessionFallback = true;
    }
    if (!out.paymentId && session.lastPaymentId) {
      out.paymentId = session.lastPaymentId;
      out.usedSessionFallback = true;
    }
    if (!out.apartmentId && session.lastApartmentId) {
      out.apartmentId = session.lastApartmentId;
      out.usedSessionFallback = true;
    }
    if (!out.buildingId && session.lastBuildingId) {
      out.buildingId = session.lastBuildingId;
      out.usedSessionFallback = true;
    }
    if (!out.tenantName && session.lastTenantName) {
      out.tenantName = session.lastTenantName;
      out.usedSessionFallback = true;
    }
  }

  return out;
}

const ID_ARG_KEYS = [
  'tenantId',
  'leaseId',
  'apartmentId',
  'buildingId',
  'paymentId',
  'tenantName',
] as const;

/**
 * Injecte les IDs session manquants quand le message est référentiel.
 * N’écrase jamais un arg déjà fourni.
 */
export function enrichToolArgs(
  toolName: string,
  args: Record<string, unknown> | undefined,
  session: AiSessionEntities,
  message: string,
  history?: ChatHistoryTurn[],
): Record<string, unknown> {
  const base = { ...(args ?? {}) };
  const flags = detectReferentialIntent(message);
  const periodHint = relativePeriod(message);
  const resolved = resolveEntitiesFromMessage(message, session, history);

  const referential =
    flags.wantsPreviousEntity ||
    flags.wantsSameAction ||
    flags.wantsLastMonth ||
    !!periodHint.period ||
    resolved.usedSessionFallback;

  if (referential) {
    if (!base.tenantId && resolved.tenantId) base.tenantId = resolved.tenantId;
    if (!base.leaseId && resolved.leaseId) base.leaseId = resolved.leaseId;
    if (!base.apartmentId && resolved.apartmentId) base.apartmentId = resolved.apartmentId;
    if (!base.buildingId && resolved.buildingId) base.buildingId = resolved.buildingId;
    if (!base.paymentId && resolved.paymentId) base.paymentId = resolved.paymentId;
    if (!base.tenantName && resolved.tenantName) base.tenantName = resolved.tenantName;

    // Repli direct session si resolve n’a rien mis mais session a l’ID
    if (!base.tenantId && session.lastTenantId) base.tenantId = session.lastTenantId;
    if (!base.leaseId && session.lastLeaseId) base.leaseId = session.lastLeaseId;
    if (!base.apartmentId && session.lastApartmentId) base.apartmentId = session.lastApartmentId;
    if (!base.buildingId && session.lastBuildingId) base.buildingId = session.lastBuildingId;
    if (!base.paymentId && session.lastPaymentId) base.paymentId = session.lastPaymentId;
    if (!base.tenantName && session.lastTenantName) base.tenantName = session.lastTenantName;
  }

  if (toolName === 'getOutstandingPayments' && periodHint.period && !base.period) {
    base.period = periodHint.period;
  }

  // Ne jamais injecter d’IDs inventés : on ne touche qu’aux clés listées ci-dessus.
  for (const k of ID_ARG_KEYS) {
    if (base[k] === '' || base[k] === null) delete base[k];
  }

  return base;
}

/**
 * Enrichit / complète une liste d’intents locaux avec contexte session + historique.
 * Si clarification nécessaire → retourne intent vide + meta (appelant doit poser la question).
 */
export function enrichLocalIntents(params: {
  message: string;
  intents: Array<{ name: string; args?: Record<string, unknown> }>;
  session?: AiSessionEntities;
  history?: ChatHistoryTurn[];
}): {
  intents: Array<{ name: string; args?: Record<string, unknown> }>;
  needsClarification?: string;
  flags: ReferentialIntentFlags;
} {
  const session = params.session ?? {};
  const flags = detectReferentialIntent(params.message);
  const periodHint = relativePeriod(params.message);
  const resolved = resolveEntitiesFromMessage(params.message, session, params.history);

  let intents = [...params.intents];

  // « mois dernier » après impayés / sans verbe métier clair → rejouer outstanding + période
  const paymentFollowUp =
    (flags.wantsLastMonth || !!periodHint.period) &&
    (flags.wantsPreviousEntity ||
      normalizeFr(params.message).includes('impay') ||
      session.lastIntent === 'getOutstandingPayments' ||
      (session.lastToolsUsed ?? []).includes('getOutstandingPayments'));

  // Clarification seulement si aucun follow-up déterministe (période / fais pareil / why)
  const canReplay =
    paymentFollowUp ||
    (flags.wantsSameAction && !!session.lastIntent) ||
    ((flags.wantsWhy || flags.wantsExplainOtherwise) && !!session.lastIntent);

  if (
    resolved.needsClarification &&
    (flags.wantsPreviousEntity || flags.wantsSameAction) &&
    params.intents.length === 0 &&
    !canReplay
  ) {
    return { intents: [], needsClarification: resolved.needsClarification, flags };
  }

  if (paymentFollowUp && !intents.some((i) => i.name === 'getOutstandingPayments')) {
    intents.push({
      name: 'getOutstandingPayments',
      args: periodHint.period ? { period: periodHint.period } : {},
    });
  }

  // « fais pareil » → rejouer lastIntent (outil lecture / propose déjà connu)
  if (flags.wantsSameAction && session.lastIntent && intents.length === 0) {
    intents.push({ name: session.lastIntent, args: {} });
  }

  // « pourquoi / explique autrement » sans nouvel intent → rejouer lastIntent lecture
  if ((flags.wantsWhy || flags.wantsExplainOtherwise) && intents.length === 0 && session.lastIntent) {
    const readTools = new Set([
      'getOutstandingPayments',
      'getDashboardSummary',
      'getVacantUnits',
      'getUnits',
      'getBuildings',
      'getContracts',
      'getTenants',
      'getFinancialSummary',
      'getExpiringContracts',
      'getTeamMembers',
      'recallMemories',
    ]);
    if (readTools.has(session.lastIntent)) {
      intents.push({ name: session.lastIntent, args: {} });
    }
  }

  intents = intents.map((intent) => ({
    name: intent.name,
    args: enrichToolArgs(intent.name, intent.args, session, params.message, params.history),
  }));

  return { intents, flags };
}

@injectable()
export class AiContextManager {
  detectReferentialIntent(message: string): ReferentialIntentFlags {
    return detectReferentialIntent(message);
  }

  resolveEntitiesFromMessage(
    message: string,
    session?: AiSessionEntities,
    history?: ChatHistoryTurn[],
  ): ResolvedEntityRefs {
    return resolveEntitiesFromMessage(message, session, history);
  }

  enrichToolArgs(
    toolName: string,
    args: Record<string, unknown> | undefined,
    session: AiSessionEntities,
    message: string,
    history?: ChatHistoryTurn[],
  ): Record<string, unknown> {
    return enrichToolArgs(toolName, args, session, message, history);
  }

  relativePeriod(message: string, now?: Date): RelativePeriodHint {
    return relativePeriod(message, now);
  }

  enrichLocalIntents(params: {
    message: string;
    intents: Array<{ name: string; args?: Record<string, unknown> }>;
    session?: AiSessionEntities;
    history?: ChatHistoryTurn[];
  }) {
    return enrichLocalIntents(params);
  }
}
