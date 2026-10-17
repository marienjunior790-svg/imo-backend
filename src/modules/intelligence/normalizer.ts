import type { DemandSpec } from './types.js';

export type RawDemandInput = {
  maxRent?: number;
  minRent?: number;
  minRooms?: number;
  minSurface?: number;
  cities?: string[];
  districts?: string[];
  currency?: string;
  locale?: string;
  weights?: DemandSpec['weights'];
  text?: string;
};

function cleanStrings(values?: string[]): string[] | undefined {
  if (!values?.length) return undefined;
  const out = values.map((v) => v.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

/** Normalise une demande brute → DemandSpec (CG/XAF v0). */
export function normalizeDemand(raw: RawDemandInput, defaults?: { currency?: string; locale?: string }): DemandSpec {
  const cities = cleanStrings(raw.cities);
  const districts = cleanStrings(raw.districts);
  const hasHard =
    raw.maxRent != null ||
    raw.minRent != null ||
    raw.minRooms != null ||
    raw.minSurface != null ||
    Boolean(cities?.length) ||
    Boolean(districts?.length);

  const partial = !hasHard;

  return {
    maxRent: raw.maxRent,
    minRent: raw.minRent,
    minRooms: raw.minRooms,
    minSurface: raw.minSurface,
    cities,
    districts,
    currency: (raw.currency ?? defaults?.currency ?? 'XAF').toUpperCase(),
    locale: raw.locale ?? defaults?.locale ?? 'fr-CG',
    weights: raw.weights,
    partial,
    text: raw.text?.trim() || undefined,
  };
}
