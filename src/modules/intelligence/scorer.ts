import { assessListingQuality } from './quality.js';
import { SCORER_VERSION } from './scorer-version.js';
import type { DemandSpec, ListingCandidate, MatchFactor, RankedMatch } from './types.js';
import { withQualityFlags } from './listing-view.js';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function defaultWeights(demand: DemandSpec) {
  const w = demand.weights ?? {};
  const raw = {
    price: w.price ?? 0.35,
    rooms: w.rooms ?? 0.2,
    location: w.location ?? 0.25,
    surface: w.surface ?? 0.1,
    quality: w.quality ?? 0.1,
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return {
    price: raw.price / sum,
    rooms: raw.rooms / sum,
    location: raw.location / sum,
    surface: raw.surface / sum,
    quality: raw.quality / sum,
  };
}

function priceScore(rent: number, demand: DemandSpec): { s: number; factor: MatchFactor } {
  if (demand.maxRent == null && demand.minRent == null) {
    return {
      s: 0.7,
      factor: { key: 'price', label: 'Budget non précisé', impact: 'neutral', weight: 0 },
    };
  }

  if (demand.maxRent != null && rent > demand.maxRent) {
    return {
      s: 0,
      factor: { key: 'price', label: 'Au-dessus du budget', impact: 'negative', weight: 1 },
    };
  }

  // Budget max seul : moins cher = mieux (pouvoir d’achat)
  if (demand.maxRent != null && demand.minRent == null) {
    const s = clamp01(1 - rent / demand.maxRent);
    return {
      s,
      factor: {
        key: 'price',
        label: s >= 0.35 ? 'Loyer avantageux pour le budget' : 'Loyer proche du plafond',
        impact: s >= 0.25 ? 'positive' : 'neutral',
        weight: s,
      },
    };
  }

  const max = demand.maxRent ?? rent * 1.2;
  const min = demand.minRent ?? 0;
  if (rent < min) {
    return {
      s: 0.4,
      factor: { key: 'price', label: 'Sous le plancher de loyer souhaité', impact: 'neutral', weight: 0.5 },
    };
  }
  // Fourchette min–max : viser le milieu
  const target = (min + max) / 2;
  const dist = Math.abs(rent - target) / Math.max(max - min, 1);
  const s = clamp01(1 - dist);
  return {
    s,
    factor: {
      key: 'price',
      label: s >= 0.7 ? 'Loyer bien adapté au budget' : 'Loyer acceptable pour le budget',
      impact: s >= 0.5 ? 'positive' : 'neutral',
      weight: s,
    },
  };
}

function roomsScore(rooms: number | null, demand: DemandSpec): { s: number; factor: MatchFactor } {
  if (demand.minRooms == null) {
    return {
      s: 0.65,
      factor: { key: 'rooms', label: 'Nombre de pièces non exigé', impact: 'neutral', weight: 0 },
    };
  }
  if (rooms == null) {
    return {
      s: 0.3,
      factor: { key: 'rooms', label: 'Pièces non renseignées', impact: 'negative', weight: 0.4 },
    };
  }
  if (rooms < demand.minRooms) {
    return {
      s: 0,
      factor: { key: 'rooms', label: 'Moins de pièces que demandé', impact: 'negative', weight: 1 },
    };
  }
  const extra = rooms - demand.minRooms;
  const s = clamp01(0.75 + Math.min(0.25, extra * 0.1));
  return {
    s,
    factor: {
      key: 'rooms',
      label: extra === 0 ? 'Nombre de pièces conforme' : `${rooms} pièces (au-dessus du minimum)`,
      impact: 'positive',
      weight: s,
    },
  };
}

function locationScore(candidate: ListingCandidate, demand: DemandSpec): { s: number; factor: MatchFactor } {
  const city = candidate.view.building?.city ?? '';
  const district = candidate.view.building?.district ?? '';
  let s = 0.5;
  const parts: string[] = [];
  if (demand.cities?.length) {
    const hit = demand.cities.some((c) => city.toLowerCase().includes(c.toLowerCase()));
    s = hit ? 1 : 0;
    if (hit) parts.push(`Ville : ${city}`);
  }
  if (demand.districts?.length) {
    const hit = demand.districts.some((d) => district.toLowerCase().includes(d.toLowerCase()));
    s = hit ? Math.max(s, 1) : s * 0.4;
    if (hit) parts.push(`Quartier : ${district}`);
  }
  if (!demand.cities?.length && !demand.districts?.length) {
    return {
      s: 0.6,
      factor: { key: 'location', label: 'Zone non précisée', impact: 'neutral', weight: 0 },
    };
  }
  return {
    s: clamp01(s),
    factor: {
      key: 'location',
      label: parts.length ? parts.join(' · ') : 'Zone peu alignée',
      impact: s >= 0.7 ? 'positive' : s >= 0.4 ? 'neutral' : 'negative',
      weight: s,
    },
  };
}

function surfaceScore(surface: number | null, demand: DemandSpec): { s: number; factor: MatchFactor } {
  if (demand.minSurface == null) {
    return {
      s: 0.6,
      factor: { key: 'surface', label: 'Surface non exigée', impact: 'neutral', weight: 0 },
    };
  }
  if (surface == null) {
    return {
      s: 0.35,
      factor: { key: 'surface', label: 'Surface non renseignée', impact: 'neutral', weight: 0.3 },
    };
  }
  if (surface < demand.minSurface) {
    return {
      s: 0,
      factor: { key: 'surface', label: 'Surface insuffisante', impact: 'negative', weight: 1 },
    };
  }
  return {
    s: 0.9,
    factor: { key: 'surface', label: `Surface ${surface} m²`, impact: 'positive', weight: 0.9 },
  };
}

function qualityScore(q: number): { s: number; factor: MatchFactor } {
  const s = clamp01(q / 100);
  return {
    s,
    factor: {
      key: 'quality',
      label: s >= 0.7 ? 'Annonce bien documentée' : s >= 0.45 ? 'Annonce correcte' : 'Annonce peu complète',
      impact: s >= 0.55 ? 'positive' : 'neutral',
      weight: s,
    },
  };
}

/** Classement déterministe + explications (scorer v0.2.0). */
export function rankMatches(eligible: ListingCandidate[], demand: DemandSpec, limit = 20): RankedMatch[] {
  const w = defaultWeights(demand);

  const ranked = eligible.map((c) => {
    const assessed = assessListingQuality(c.view);
    const listing = withQualityFlags(c.view, assessed.flags);

    const p = priceScore(listing.rentAmount, demand);
    const r = roomsScore(listing.rooms, demand);
    const l = locationScore({ ...c, view: listing }, demand);
    const s = surfaceScore(listing.surface, demand);
    const q = qualityScore(listing.quality.score);

    const raw =
      100 * (w.price * p.s + w.rooms * r.s + w.location * l.s + w.surface * s.s + w.quality * q.s);
    const score = Math.round(raw * assessed.penalty);

    let factors = [p.factor, r.factor, l.factor, s.factor, q.factor]
      .filter((f) => f.impact !== 'neutral' || f.weight > 0.5)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);

    if (assessed.flags.includes('ROOMS_CONTRADICTION')) {
      factors = [
        {
          key: 'quality',
          label: 'Incohérence pièces / description',
          impact: 'negative' as const,
          weight: 0.8,
        },
        ...factors,
      ].slice(0, 4);
    }

    // Couverture d’explication : au moins 1 facteur
    if (!factors.length) {
      factors = [
        {
          key: 'match',
          label: 'Correspondance partielle aux critères',
          impact: 'neutral',
          weight: 0.5,
        },
      ];
    }

    return {
      listing,
      score: Math.max(0, Math.min(100, score)),
      factors,
      scorerVersion: SCORER_VERSION,
    } satisfies RankedMatch;
  });

  ranked.sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id));
  return ranked.slice(0, limit);
}
