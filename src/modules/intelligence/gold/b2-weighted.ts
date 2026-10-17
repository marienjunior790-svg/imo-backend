import { toListingView } from '../listing-view.js';
import type { RawDemandInput } from '../normalizer.js';
import type { ListingCandidate } from '../types.js';

/**
 * Corpus gold B2 — préférences pondérées.
 * Grades de pertinence humaine figés (3=idéal … 0=non pertinent).
 */
export function goldB2Corpus(): ListingCandidate[] {
  const base = (o: {
    id: string;
    rent: number;
    rooms: number;
    district: string;
    surface: number;
    address?: string;
    description?: string;
    photos?: string[];
  }): ListingCandidate => {
    const view = toListingView({
      id: o.id,
      label: o.id,
      description: o.description ?? `Appartement ${o.rooms} pièces à ${o.district}`,
      rooms: o.rooms,
      surface: o.surface,
      floor: 2,
      rentAmount: o.rent,
      currency: 'XAF',
      status: 'AVAILABLE',
      isPublished: true,
      publishedAt: new Date('2026-09-15T00:00:00Z'),
      amenities: '["clim","parking"]',
      building: {
        name: 'Gold Residence',
        address: o.address ?? `${o.id} av. de la Paix`,
        district: o.district,
        city: 'Brazzaville',
        latitude: null,
        longitude: null,
      },
      organization: {
        id: 'org-gold',
        name: 'Gold Org',
        type: 'AGENCY',
        isActive: true,
        isValidated: true,
      },
      documents: (o.photos ?? ['https://cdn.example/g.jpg']).map((u) => ({
        cloudinaryUrl: u,
        type: 'APARTMENT_PHOTO',
      })),
    });
    return { view, isPublished: true, orgActive: true, orgValidated: true };
  };

  return [
    base({ id: 'g-pot-160', rent: 160_000, rooms: 2, district: 'Poto-Poto', surface: 55 }),
    base({ id: 'g-pot-175', rent: 175_000, rooms: 2, district: 'Poto-Poto', surface: 58 }),
    base({ id: 'g-mou-140', rent: 140_000, rooms: 2, district: 'Moungali', surface: 50 }),
    base({ id: 'g-pot-195', rent: 195_000, rooms: 3, district: 'Poto-Poto', surface: 80 }),
    base({ id: 'g-bac-170', rent: 170_000, rooms: 2, district: 'Bacongo', surface: 52 }),
  ];
}

/** Hard district Poto-Poto + budget 180k → seuls g-pot-160 et g-pot-175. */
export const GOLD_B2_DISTRICT_DEMAND: RawDemandInput = {
  maxRent: 180_000,
  minRooms: 2,
  cities: ['Brazzaville'],
  districts: ['Poto-Poto'],
  currency: 'XAF',
  weights: { price: 0.45, location: 0.35, rooms: 0.1, quality: 0.1, surface: 0 },
};

export const GOLD_B2_DISTRICT_EXPECTED_ORDER = ['g-pot-160', 'g-pot-175'] as const;

export const GOLD_B2_DISTRICT_GRADES: Record<string, number> = {
  'g-pot-160': 3,
  'g-pot-175': 2,
};

/** Poids prix dominant — ordre attendu du moins cher au plus cher (top). */
export const GOLD_B2_PRICE_DEMAND: RawDemandInput = {
  maxRent: 200_000,
  minRooms: 2,
  cities: ['Brazzaville'],
  currency: 'XAF',
  weights: { price: 0.75, location: 0.05, rooms: 0.1, quality: 0.05, surface: 0.05 },
};

/** Moins cher d’abord (scorer prix = 1 − rent/max). */
export const GOLD_B2_PRICE_EXPECTED_TOP3 = ['g-mou-140', 'g-pot-160', 'g-bac-170'] as const;

export const GOLD_B2_PRICE_GRADES: Record<string, number> = {
  'g-mou-140': 3,
  'g-pot-160': 2,
  'g-bac-170': 2,
  'g-pot-175': 1,
  'g-pot-195': 1,
};

/** Corpus B5/B6 — contradiction + doublon. */
export function goldQualityCorpus(): ListingCandidate[] {
  const mk = (
    id: string,
    opts: {
      rent: number;
      rooms: number;
      description: string;
      address: string;
      photos?: string[];
    },
  ): ListingCandidate => {
    const view = toListingView({
      id,
      label: id,
      description: opts.description,
      rooms: opts.rooms,
      surface: 55,
      floor: 1,
      rentAmount: opts.rent,
      currency: 'XAF',
      status: 'AVAILABLE',
      isPublished: true,
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      amenities: null,
      building: {
        name: 'Q',
        address: opts.address,
        district: 'Poto-Poto',
        city: 'Brazzaville',
        latitude: null,
        longitude: null,
      },
      organization: {
        id: 'org-q',
        name: 'Q',
        type: 'OWNER',
        isActive: true,
        isValidated: true,
      },
      documents: (opts.photos ?? []).map((u) => ({ cloudinaryUrl: u, type: 'APARTMENT_PHOTO' })),
    });
    return { view, isPublished: true, orgActive: true, orgValidated: true };
  };

  return [
    mk('q-good', {
      rent: 150_000,
      rooms: 2,
      description: 'Appartement 2 pièces lumineux',
      address: '10 rue Alpha',
      photos: ['https://cdn.example/a.jpg'],
    }),
    mk('q-contradict', {
      rent: 150_000,
      rooms: 2,
      description: 'Magnifique 4 pièces avec balcon',
      address: '11 rue Beta',
      photos: ['https://cdn.example/b.jpg'],
    }),
    // Doublon de q-good (même adresse/surface/loyer)
    mk('q-dup', {
      rent: 150_000,
      rooms: 2,
      description: 'Appartement 2 pièces copie',
      address: '10 rue Alpha',
      photos: [],
    }),
  ];
}
