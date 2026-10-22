import type { DemandSpec, ListingCandidate } from './types.js';

export type EligibilityOutcome =
  | { ok: true; eligible: ListingCandidate[] }
  | { ok: false; code: 'EMPTY_ELIGIBLE'; suggestions: string[]; eligible: [] };

function cityOk(demand: DemandSpec, city: string | undefined): boolean {
  if (!demand.cities?.length) return true;
  if (!city) return false;
  const c = city.toLowerCase();
  return demand.cities.some((x) => c.includes(x.toLowerCase()) || x.toLowerCase().includes(c));
}

function districtOk(demand: DemandSpec, district: string | null | undefined): boolean {
  // Préférence (`preferredDistricts`) : volontairement absente. Elle ne filtre pas.
  if (!demand.districts?.length) return true;
  if (!district) return false;
  const d = district.toLowerCase();
  return demand.districts.some((x) => d.includes(x.toLowerCase()) || x.toLowerCase().includes(d));
}

function districtNotExcluded(demand: DemandSpec, district: string | null | undefined): boolean {
  if (!demand.excludedDistricts?.length) return true;
  if (!district) return true;
  const d = district.toLowerCase();
  return !demand.excludedDistricts.some((x) => d.includes(x.toLowerCase()) || x.toLowerCase().includes(d));
}

/** Règles strictes d’éligibilité (hard constraints). */
export function filterEligible(candidates: ListingCandidate[], demand: DemandSpec): EligibilityOutcome {
  const eligible = candidates.filter((c) => {
    const v = c.view;
    if (!c.isPublished) return false;
    if (!c.orgActive || !c.orgValidated) return false;
    if (v.status !== 'AVAILABLE') return false;
    if (v.currency.toUpperCase() !== demand.currency.toUpperCase()) return false;
    if (demand.maxRent != null && v.rentAmount > demand.maxRent) return false;
    if (demand.minRent != null && v.rentAmount < demand.minRent) return false;
    if (demand.minRooms != null && (v.rooms == null || v.rooms < demand.minRooms)) return false;
    if (demand.minSurface != null && (v.surface == null || v.surface < demand.minSurface)) return false;
    if (!cityOk(demand, v.building?.city)) return false;
    if (!districtOk(demand, v.building?.district)) return false;
    if (!districtNotExcluded(demand, v.building?.district)) return false;
    return true;
  });

  if (eligible.length === 0) {
    const suggestions: string[] = [];
    if (demand.maxRent != null) suggestions.push('Augmenter le budget maximal');
    if (demand.minRooms != null && demand.minRooms > 1) suggestions.push('Réduire le nombre de pièces minimum');
    if (demand.cities?.length) suggestions.push('Élargir les villes recherchées');
    if (demand.districts?.length) suggestions.push('Élargir les quartiers recherchés');
    if (demand.excludedDistricts?.length) suggestions.push('Retirer un quartier exclu');
    if (demand.minSurface != null) suggestions.push('Assouplir la surface minimale');
    if (!suggestions.length) suggestions.push('Assouplir les critères ou réessayer plus tard');
    return { ok: false, code: 'EMPTY_ELIGIBLE', suggestions, eligible: [] };
  }

  return { ok: true, eligible };
}
