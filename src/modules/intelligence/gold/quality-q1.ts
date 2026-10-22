import { toListingView } from '../listing-view.js';
import type { RawDemandInput } from '../normalizer.js';
import type { ListingCandidate } from '../types.js';

/**
 * Jeu de référence GO-MATCH-QUALITY-1.
 * Jugements humains explicites. Aucune donnée personnelle.
 * Même publishedAt partout : le terme fraîcheur (Date.now) reste commun, l'ordre ne dérive pas.
 */
const PUBLISHED_AT = new Date('2026-10-15T00:00:00Z');

export type QualityExclude = 'BUDGET' | 'ROOMS' | 'CITY' | 'PUBLICATION' | 'STATUS' | 'ORG';

export type QualityJudgment = {
  id: string;
  /** 3 = idéal en tête, 2 = pertinent, 1 = acceptable, 0 = non pertinent. */
  grade: 0 | 1 | 2 | 3;
  /** Présent = le bien ne doit jamais être proposé. */
  exclude?: QualityExclude;
};

export type QualityQuery = {
  id: string;
  criterion: string;
  demand: RawDemandInput;
  /** grade >= seuil et sans exclude = résultat qui doit apparaître. */
  relevantMinGrade: 2;
  judgments: QualityJudgment[];
};

type Seed = {
  id: string;
  rent: number;
  rooms: number;
  district: string;
  city: string;
  surface: number;
  description: string;
  photos?: string[];
  published?: boolean;
  status?: string;
  orgActive?: boolean;
  orgValidated?: boolean;
  address?: string;
};

function candidate(o: Seed): ListingCandidate {
  const view = toListingView({
    id: o.id,
    label: o.id,
    description: o.description,
    rooms: o.rooms,
    surface: o.surface,
    floor: 2,
    rentAmount: o.rent,
    currency: 'XAF',
    status: o.status ?? 'AVAILABLE',
    isPublished: o.published !== false,
    publishedAt: PUBLISHED_AT,
    amenities: '["clim"]',
    building: {
      name: 'Ref Q1',
      address: o.address ?? `${o.id} avenue de la Paix`,
      district: o.district,
      city: o.city,
      latitude: null,
      longitude: null,
    },
    organization: {
      id: 'org-q1',
      name: 'Org Q1',
      type: 'AGENCY',
      isActive: true,
      isValidated: true,
    },
    documents: (o.photos ?? []).map((u) => ({ cloudinaryUrl: u, type: 'APARTMENT_PHOTO' })),
  });
  return {
    view,
    isPublished: o.published !== false,
    orgActive: o.orgActive !== false,
    orgValidated: o.orgValidated !== false,
  };
}

const PHOTO = ['https://cdn.example/q1-a.jpg', 'https://cdn.example/q1-b.jpg', 'https://cdn.example/q1-c.jpg'];

/** Corpus figé partagé par toutes les requêtes Q1. */
export function qualityQ1Corpus(): ListingCandidate[] {
  return [
    candidate({
      id: 'q-ideal-180',
      rent: 180_000,
      rooms: 3,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 72,
      description: 'Appartement 3 pièces lumineux',
      photos: PHOTO,
    }),
    candidate({
      id: 'q-mid-250',
      rent: 250_000,
      rooms: 3,
      district: 'Moungali',
      city: 'Brazzaville',
      surface: 68,
      description: 'Appartement 3 pièces calme',
      photos: PHOTO,
      address: '12 avenue Moungali',
    }),
    candidate({
      id: 'q-mid-dup',
      rent: 250_000,
      rooms: 3,
      district: 'Moungali',
      city: 'Brazzaville',
      surface: 68,
      description: 'Appartement 3 pièces copie',
      photos: [],
      address: '12 avenue Moungali',
    }),
    candidate({
      id: 'q-room-280',
      rent: 280_000,
      rooms: 4,
      district: 'Bacongo',
      city: 'Brazzaville',
      surface: 90,
      description: 'Appartement 4 pièces',
      photos: PHOTO,
    }),
    candidate({
      id: 'q-pot-270',
      rent: 270_000,
      rooms: 3,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 70,
      description: 'Appartement 3 pièces',
      photos: PHOTO,
    }),
    candidate({
      id: 'q-over-350',
      rent: 350_000,
      rooms: 3,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 80,
      description: 'Appartement 3 pièces',
      photos: PHOTO,
    }),
    candidate({
      id: 'q-rooms-2',
      rent: 120_000,
      rooms: 2,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 48,
      description: 'Appartement 2 pièces',
      photos: PHOTO,
    }),
    candidate({
      id: 'q-pn-180',
      rent: 180_000,
      rooms: 3,
      district: 'Centre-ville',
      city: 'Pointe-Noire',
      surface: 70,
      description: 'Appartement 3 pièces',
      photos: PHOTO,
    }),
    candidate({
      id: 'q-unpub',
      rent: 160_000,
      rooms: 3,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 70,
      description: 'Appartement 3 pièces',
      photos: PHOTO,
      published: false,
    }),
    candidate({
      id: 'q-rented',
      rent: 170_000,
      rooms: 3,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 66,
      description: 'Appartement 3 pièces',
      photos: PHOTO,
      status: 'RENTED',
    }),
    candidate({
      id: 'q-org-off',
      rent: 150_000,
      rooms: 3,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 64,
      description: 'Appartement 3 pièces',
      photos: PHOTO,
      orgActive: false,
    }),
    candidate({
      id: 'q-fair-170',
      rent: 170_000,
      rooms: 2,
      district: 'Poto-Poto',
      city: 'Brazzaville',
      surface: 55,
      description: 'Appartement 2 pièces',
      photos: PHOTO,
    }),
    candidate({
      id: 'q-cheap-bad',
      rent: 110_000,
      rooms: 2,
      district: 'Moungali',
      city: 'Brazzaville',
      surface: 40,
      description: 'Magnifique 4 pièces avec balcon',
      photos: [],
    }),
  ];
}

const HARD_EXCLUDES: QualityJudgment[] = [
  { id: 'q-over-350', grade: 0, exclude: 'BUDGET' },
  { id: 'q-rooms-2', grade: 0, exclude: 'ROOMS' },
  { id: 'q-pn-180', grade: 0, exclude: 'CITY' },
  { id: 'q-unpub', grade: 0, exclude: 'PUBLICATION' },
  { id: 'q-rented', grade: 0, exclude: 'STATUS' },
  { id: 'q-org-off', grade: 0, exclude: 'ORG' },
];

/**
 * Critères explicites.
 * Q1-district : le quartier est jugé comme préférence (grade 2 encore pertinent).
 * Le moteur, lui, l'applique comme filtre dur — l'écart est mesuré, pas corrigé ici.
 */
export function qualityQ1Queries(): QualityQuery[] {
  return [
    {
      id: 'Q1-budget-rooms-city',
      criterion:
        '3 pièces, loyer ≤ 300 000 XAF, Brazzaville. Le moins cher à qualité égale passe devant. Le doublon Moungali ne compte pas comme un second bien.',
      demand: { minRooms: 3, maxRent: 300_000, cities: ['Brazzaville'], currency: 'XAF' },
      relevantMinGrade: 2,
      judgments: [
        { id: 'q-ideal-180', grade: 3 },
        { id: 'q-mid-250', grade: 2 },
        { id: 'q-mid-dup', grade: 1 },
        { id: 'q-pot-270', grade: 2 },
        { id: 'q-room-280', grade: 1 },
        { id: 'q-fair-170', grade: 0, exclude: 'ROOMS' },
        { id: 'q-cheap-bad', grade: 0, exclude: 'ROOMS' },
        ...HARD_EXCLUDES,
      ],
    },
    {
      id: 'Q1-district-preference',
      criterion:
        'Même budget et pièces, préférence Poto-Poto. Un 3 pièces à Moungali sous le budget reste pertinent (grade 2) : le quartier ne devrait pas l’effacer.',
      demand: {
        minRooms: 3,
        maxRent: 300_000,
        cities: ['Brazzaville'],
        districts: ['Poto-Poto'],
        currency: 'XAF',
      },
      relevantMinGrade: 2,
      judgments: [
        { id: 'q-ideal-180', grade: 3 },
        { id: 'q-pot-270', grade: 2 },
        { id: 'q-mid-250', grade: 2 },
        { id: 'q-mid-dup', grade: 1 },
        { id: 'q-room-280', grade: 1 },
        { id: 'q-fair-170', grade: 0, exclude: 'ROOMS' },
        { id: 'q-cheap-bad', grade: 0, exclude: 'ROOMS' },
        ...HARD_EXCLUDES,
      ],
    },
    {
      id: 'Q1-incomplete-vs-complete',
      criterion:
        '2 pièces, loyer ≤ 200 000 XAF, Brazzaville. Une annonce cohérente et illustrée prime sur une annonce moins chère qui contredit le nombre de pièces et n’a pas de photo.',
      demand: { minRooms: 2, maxRent: 200_000, cities: ['Brazzaville'], currency: 'XAF' },
      relevantMinGrade: 2,
      judgments: [
        { id: 'q-rooms-2', grade: 3 },
        { id: 'q-ideal-180', grade: 2 },
        { id: 'q-fair-170', grade: 2 },
        { id: 'q-cheap-bad', grade: 0 },
        { id: 'q-mid-250', grade: 0, exclude: 'BUDGET' },
        { id: 'q-mid-dup', grade: 0, exclude: 'BUDGET' },
        { id: 'q-pot-270', grade: 0, exclude: 'BUDGET' },
        { id: 'q-room-280', grade: 0, exclude: 'BUDGET' },
        { id: 'q-over-350', grade: 0, exclude: 'BUDGET' },
        { id: 'q-pn-180', grade: 0, exclude: 'CITY' },
        { id: 'q-unpub', grade: 0, exclude: 'PUBLICATION' },
        { id: 'q-rented', grade: 0, exclude: 'STATUS' },
        { id: 'q-org-off', grade: 0, exclude: 'ORG' },
      ],
    },
  ];
}
