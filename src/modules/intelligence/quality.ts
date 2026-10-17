import type { ListingView } from './types.js';

export type QualityFlags = {
  flags: string[];
  /** Multiplicateur de score soft 0.5–1.0 */
  penalty: number;
};

/**
 * Détecte incohérences / annonces pauvres (B5) — n’exclut pas, pénalise.
 */
export function assessListingQuality(view: ListingView): QualityFlags {
  const flags: string[] = [];
  let penalty = 1;

  if (!view.quality.hasPhotos) {
    flags.push('NO_PHOTOS');
    penalty *= 0.85;
  }
  if (!view.quality.hasDescription) {
    flags.push('NO_DESCRIPTION');
    penalty *= 0.9;
  }
  if (view.rentAmount <= 0) {
    flags.push('INVALID_RENT');
    penalty *= 0.5;
  }
  if (view.rooms != null && view.description) {
    const m = view.description.match(/(\d+)\s*pi[eè]ces?/i);
    if (m) {
      const mentioned = Number(m[1]);
      if (Number.isFinite(mentioned) && mentioned !== view.rooms) {
        flags.push('ROOMS_CONTRADICTION');
        penalty *= 0.7;
      }
    }
  }
  if (view.quality.freshnessDays != null && view.quality.freshnessDays > 90) {
    flags.push('STALE_LISTING');
    penalty *= 0.88;
  }

  return { flags, penalty: Math.max(0.5, Math.min(1, penalty)) };
}
