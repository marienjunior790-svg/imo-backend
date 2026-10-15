import { CommercialPlan } from './plans.config.js';

/**
 * Quotas IA — configuration distincte de la matrice des capacités.
 *
 * Unités (opérations réellement facturées par le fournisseur IA) :
 *   AI_MESSAGE : un message traité par l'assistant (/ai/chat) ou une proposition de contrat (/ai/contract)
 *   AI_IMAGE   : une image analysée (/ai/vision)
 *   AI_AUDIO   : une transcription vocale (/ai/transcribe) ou une lecture à voix haute (/ai/speak)
 * Non comptés : statut, mémoire, suggestions, correction de texte, confirmation/annulation d'action,
 * analyses et prévisions (calculées localement à partir des données, sans appel au fournisseur IA).
 *
 * Comptabilisation : réservation atomique avant l'appel, rendue si le traitement échoue techniquement.
 * Période : mois calendaire, remise à zéro le 1er à 00:00 (heure de Brazzaville, UTC+1).
 *
 * null = limite non encore décidée : l'usage n'est pas plafonné mais il est compté.
 * Aucune valeur n'est fixée ici sans validation commerciale.
 */
export const AiUnit = {
  AI_MESSAGE: 'AI_MESSAGE',
  AI_IMAGE: 'AI_IMAGE',
  AI_AUDIO: 'AI_AUDIO',
} as const;

export type AiUnit = (typeof AiUnit)[keyof typeof AiUnit];

export const AI_UNITS: readonly AiUnit[] = Object.values(AiUnit);

export const AI_UNIT_LABELS: Record<AiUnit, string> = {
  AI_MESSAGE: 'Messages à l\'assistant',
  AI_IMAGE: 'Images analysées',
  AI_AUDIO: 'Opérations vocales',
};

export const AI_QUOTAS: Partial<Record<CommercialPlan, Record<AiUnit, number | null>>> = {
  PRO_MAX: {
    AI_MESSAGE: null,
    AI_IMAGE: null,
    AI_AUDIO: null,
  },
};

/** Fuseau de remise à zéro : Brazzaville (UTC+1, sans heure d'été). */
const RESET_OFFSET_MS = 60 * 60 * 1000;

/** Début (UTC) du mois de quota contenant `at`. */
export function quotaPeriodStart(at: Date): Date {
  const local = new Date(at.getTime() + RESET_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - RESET_OFFSET_MS);
}

/** Début (UTC) du mois de quota suivant. */
export function nextQuotaReset(at: Date): Date {
  const local = new Date(at.getTime() + RESET_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - RESET_OFFSET_MS);
}

export function quotaLimit(plan: CommercialPlan, unit: AiUnit): number | null {
  return AI_QUOTAS[plan]?.[unit] ?? null;
}
