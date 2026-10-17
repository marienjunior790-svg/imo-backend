/**
 * Contrats Core Intelligence CI-1 — DTO publics uniquement.
 * Aucun champ gestion (tenant, lease, payment, idNumber, org phone…).
 */

export type ListingProvenance = 'INTERNAL_GESTION' | 'EXTERNAL_PLATFORM';

/** Projection whitelist d’une annonce pour matching / catalogue. */
export interface ListingView {
  id: string;
  label: string;
  description: string | null;
  rooms: number | null;
  surface: number | null;
  floor: number | null;
  rentAmount: number;
  currency: string;
  status: string;
  publishedAt: string | null;
  amenities: string[];
  photoUrls: string[];
  provenance: ListingProvenance;
  building: {
    name: string;
    address: string;
    district: string | null;
    city: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  organization: {
    id: string;
    name: string;
    type: string;
  };
  quality: {
    score: number;
    hasPhotos: boolean;
    hasDescription: boolean;
    freshnessDays: number | null;
    flags: string[];
  };
}

/** Spécification de demande normalisée. */
export interface DemandSpec {
  maxRent?: number;
  minRent?: number;
  minRooms?: number;
  minSurface?: number;
  cities?: string[];
  districts?: string[];
  currency: string;
  locale: string;
  /** Pondérations 0–1 (somme non obligatoire — normalisées en interne). */
  weights?: {
    price?: number;
    rooms?: number;
    location?: number;
    surface?: number;
    quality?: number;
  };
  partial: boolean;
  text?: string;
}

export interface MatchFactor {
  key: string;
  label: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
}

export interface RankedMatch {
  listing: ListingView;
  score: number;
  factors: MatchFactor[];
  scorerVersion: string;
}

export interface MatchInterpretationMeta {
  interpreterVersion: string;
  fieldsFromText: string[];
  clarifications: string[];
  incomplete: boolean;
}

/** Métadonnées de recall (transparence SCALE — cap mémoire). */
export interface MatchRetrievalMeta {
  strategy: 'published_at_desc_take';
  /** Nombre de candidats chargés depuis la base (après where, avant scoring). */
  candidateCount: number;
  /** true si le rappel a atteint recallLimit (annonces plus anciennes potentiellement absentes). */
  truncated: boolean;
  recallLimit: number;
}

export interface MatchResult {
  demand: DemandSpec;
  matches: RankedMatch[];
  eligibleCount: number;
  scorerVersion: string;
  emptyReason?: 'EMPTY_ELIGIBLE';
  suggestions?: string[];
  interpretation?: MatchInterpretationMeta;
  retrieval?: MatchRetrievalMeta;
}

/** Ligne interne pour éligibilité / score (peut contenir flags techniques, jamais exposée brute). */
export interface ListingCandidate {
  view: ListingView;
  isPublished: boolean;
  orgActive: boolean;
  orgValidated: boolean;
}
