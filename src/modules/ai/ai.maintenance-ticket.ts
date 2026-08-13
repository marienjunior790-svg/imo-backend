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
