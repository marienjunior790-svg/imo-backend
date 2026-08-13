/**
 * Phase K1 — Propose / confirm ticket maintenance (sans nouveau tool OpenAI).
 * Réutilise MaintenanceService.create via pending CREATE_MAINTENANCE_TICKET.
 */
import type { MaintenancePriority } from '@prisma/client';
import type { VisionClassification } from './ai.vision.js';
import type { VisionUnitHint } from './ai.vision.js';

function normalizeFr(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'")
    .trim();
}

/**
 * Intent NL : créer / ouvrir un ticket maintenance (pas l’automation StaffTask).
 */
export function wantsCreateMaintenanceTicket(message: string): boolean {
  const q = normalizeFr(message);
  if (q.includes('automatis')) return false;
  if (q.includes('taches maintenance') || q.includes('taches depuis')) return false;

  const createVerb =
    q.includes('cree') ||
    q.includes('creer') ||
    q.includes('ouvre') ||
    q.includes('ouvrir') ||
    q.includes('ouvre') ||
    q.includes('signal') ||
    q.includes('ouvre un') ||
    q.includes('faire un');

  const ticketish =
    q.includes('ticket') ||
    (q.includes('maintenance') && (createVerb || q.includes('intervention'))) ||
    (q.includes('fuite') && createVerb);

  return createVerb && ticketish;
}

export function buildMaintenanceTicketTitle(input: {
  classification?: VisionClassification;
  unit?: VisionUnitHint;
  reading?: string;
  userPrompt?: string;
}): string {
  const label = input.unit?.apartmentLabel?.trim();
  const signals = input.classification?.damageSignals?.slice(0, 2).join(' / ');
  const fromReading = (input.reading ?? input.userPrompt ?? '')
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 8);
  const base =
    signals && signals.length >= 3
      ? `Dégât : ${signals}`
      : fromReading
        ? fromReading.slice(0, 80)
        : 'Intervention maintenance';
  const withUnit = label ? `${base} — ${label}` : base;
  return withUnit.slice(0, 200);
}

export function buildMaintenanceTicketDescription(input: {
  reading?: string;
  userPrompt?: string;
}): string | undefined {
  const parts = [input.userPrompt?.trim(), input.reading?.trim()].filter(Boolean);
  if (!parts.length) return undefined;
  return parts.join('\n\n').slice(0, 2000);
}

export function priorityFromVisionHint(
  hint: VisionClassification['priorityHint'],
): MaintenancePriority | undefined {
  if (!hint) return undefined;
  return hint as MaintenancePriority;
}

export function buildMaintenanceProposeAppendix(input: {
  apartmentLabel?: string;
  priority?: string | null;
  pending: boolean;
}): string {
  if (!input.pending) {
    return (
      `\n\n---\n` +
      `**Ticket maintenance**\n` +
      `• Logement non identifié — précisez le libellé (ex. « Appt 3B ») puis « crée le ticket ».\n` +
      `• Aucun ticket n’est créé sans confirmation.\n`
    );
  }
  return (
    `\n\n---\n` +
    `**Proposition ticket maintenance**\n` +
    `• Logement : **${input.apartmentLabel ?? '—'}**\n` +
    (input.priority ? `• Priorité suggérée : **${input.priority}**\n` : '') +
    `• Répondez **« oui »** / **« confirme »** pour créer le ticket OPEN, ou **« annule »**.\n` +
    `• Je ne crée pas le ticket tout seul.\n`
  );
}

/**
 * Intent NL : assigner un ticket à un agent (pas création, pas automation).
 */
export function wantsAssignMaintenanceTicket(message: string): boolean {
  const q = normalizeFr(message);
  if (q.includes('automatis')) return false;
  if (wantsCreateMaintenanceTicket(message) && !q.includes('assign') && !q.includes('attrib')) {
    return false;
  }

  const assignVerb =
    q.includes('assign') ||
    q.includes('attrib') ||
    q.includes('donne a') ||
    q.includes('donne à') ||
    (q.includes('envoie') && q.includes('agent'));

  const target =
    q.includes('ticket') ||
    q.includes('maintenance') ||
    q.includes('technicien') ||
    q.includes('agent') ||
    q.includes('intervention');

  return assignVerb && target;
}

/** Extrait un nom d’agent après « à / a / agent ». */
export function extractAssigneeNameHint(message: string): string | undefined {
  const raw = message.trim();
  const patterns = [
    /(?:assigne[rz]?|attribue[rz]?|donne)\s+(?:le\s+ticket\s+)?(?:[àa]\s+)?(?:l['’]agent\s+)?(.+)$/i,
    /(?:assigne[rz]?|attribue[rz]?)\s+(?:[àa]\s+)?(.+)$/i,
    /agent\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-']+(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-']+)?)/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m?.[1]) continue;
    let name = m[1]
      .replace(/\b(le|la|les|ticket|maintenance|technicien|s['’]il|svp|please)\b/gi, ' ')
      .replace(/[?.!,;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (name.length >= 2 && name.length <= 80) return name;
  }
  return undefined;
}

export function matchMaintenanceAgentByName<T extends { id: string; firstName: string; lastName: string }>(
  agents: T[],
  hint: string | undefined,
): { match?: T; ambiguous: T[] } {
  if (!hint || !agents.length) return { ambiguous: [] };
  const q = normalizeFr(hint);
  const scored = agents
    .map((a) => {
      const full = normalizeFr(`${a.firstName} ${a.lastName}`);
      const rev = normalizeFr(`${a.lastName} ${a.firstName}`);
      const first = normalizeFr(a.firstName);
      const last = normalizeFr(a.lastName);
      let score = 0;
      if (full === q || rev === q) score = 100;
      else if (full.includes(q) || rev.includes(q) || q.includes(full)) score = 80;
      else if (last.length >= 2 && q.includes(last)) score = 60;
      else if (first.length >= 2 && q.includes(first)) score = 40;
      return { a, score };
    })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);

  if (!scored.length) return { ambiguous: [] };
  const top = scored[0]!.score;
  const ties = scored.filter((s) => s.score === top).map((s) => s.a);
  if (ties.length > 1) return { ambiguous: ties };
  return { match: ties[0], ambiguous: [] };
}
