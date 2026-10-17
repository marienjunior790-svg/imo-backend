import type { ListingProvenance, ListingView } from './types.js';

/** Champs interdits sur toute réponse matching (garde-fou tests). */
export const FORBIDDEN_LISTING_KEYS = [
  'tenantId',
  'leaseId',
  'paymentId',
  'idNumber',
  'passwordHash',
  'monthlyIncome',
  'contractPdfUrl',
  'phone',
  'email',
  'guarantorPhone',
  'guarantorName',
  'applicantUserId',
] as const;

export type ApartmentListingSource = {
  id: string;
  label: string;
  description: string | null;
  rooms: number | null;
  surface: number | { toNumber(): number } | null;
  floor: number | null;
  rentAmount: number | { toNumber(): number };
  currency: string;
  status: string;
  isPublished: boolean;
  publishedAt: Date | null;
  amenities: string | null;
  building: {
    name: string;
    address: string;
    district: string | null;
    city: string;
    latitude: number | { toNumber(): number } | null;
    longitude: number | { toNumber(): number } | null;
  } | null;
  organization: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    isValidated: boolean;
  };
  documents?: { cloudinaryUrl: string; type: string }[];
};

function num(v: number | { toNumber(): number } | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  return v.toNumber();
}

function parseAmenities(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).slice(0, 40);
  } catch {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  return [];
}

function qualityOf(input: {
  photoCount: number;
  hasDescription: boolean;
  publishedAt: Date | null;
}): ListingView['quality'] {
  let score = 40;
  const hasPhotos = input.photoCount > 0;
  if (hasPhotos) score += Math.min(30, input.photoCount * 10);
  if (input.hasDescription) score += 15;
  let freshnessDays: number | null = null;
  if (input.publishedAt) {
    freshnessDays = Math.max(0, Math.floor((Date.now() - input.publishedAt.getTime()) / 86_400_000));
    if (freshnessDays <= 7) score += 15;
    else if (freshnessDays <= 30) score += 8;
    else if (freshnessDays > 90) score -= 10;
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    hasPhotos,
    hasDescription: input.hasDescription,
    freshnessDays,
    flags: [],
  };
}

export function toListingView(
  apt: ApartmentListingSource,
  provenance: ListingProvenance = 'INTERNAL_GESTION',
): ListingView {
  const photos = (apt.documents ?? [])
    .filter((d) => d.type === 'APARTMENT_PHOTO')
    .map((d) => d.cloudinaryUrl)
    .filter(Boolean)
    .slice(0, 5);

  const description = apt.description?.trim() || null;
  const publishedAt = apt.publishedAt;

  return {
    id: apt.id,
    label: apt.label,
    description,
    rooms: apt.rooms,
    surface: num(apt.surface),
    floor: apt.floor,
    rentAmount: num(apt.rentAmount) ?? 0,
    currency: apt.currency,
    status: apt.status,
    publishedAt: publishedAt ? publishedAt.toISOString() : null,
    amenities: parseAmenities(apt.amenities),
    photoUrls: photos,
    provenance,
    building: apt.building
      ? {
          name: apt.building.name,
          address: apt.building.address,
          district: apt.building.district,
          city: apt.building.city,
          latitude: num(apt.building.latitude),
          longitude: num(apt.building.longitude),
        }
      : null,
    organization: {
      id: apt.organization.id,
      name: apt.organization.name,
      type: apt.organization.type,
    },
    quality: qualityOf({
      photoCount: photos.length,
      hasDescription: Boolean(description),
      publishedAt,
    }),
  };
}

/** Applique flags qualité (B5) sur une vue déjà construite. */
export function withQualityFlags(view: ListingView, flags: string[]): ListingView {
  return {
    ...view,
    quality: { ...view.quality, flags },
  };
}

/** Vérifie qu’un objet sérialisé ne contient pas de clés privées (récursif shallow+1). */
export function assertNoPrivateLeak(payload: unknown): string[] {
  const leaks: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if ((FORBIDDEN_LISTING_KEYS as readonly string[]).includes(k)) leaks.push(p);
      if (v && typeof v === 'object') walk(v, p);
    }
  };
  walk(payload, '');
  return leaks;
}
