import { filterEligible } from '../../src/modules/intelligence/eligibility';
import { runMatchEngine } from '../../src/modules/intelligence/matching.engine';
import {
  assertNoPrivateLeak,
  FORBIDDEN_LISTING_KEYS,
  toListingView,
} from '../../src/modules/intelligence/listing-view';
import { normalizeDemand } from '../../src/modules/intelligence/normalizer';
import { SCORER_VERSION } from '../../src/modules/intelligence/scorer-version';
import type { ListingCandidate } from '../../src/modules/intelligence/types';

function candidate(overrides: {
  id: string;
  rent: number;
  rooms?: number | null;
  status?: string;
  published?: boolean;
  city?: string;
  district?: string | null;
  orgActive?: boolean;
  orgValidated?: boolean;
  surface?: number | null;
  description?: string | null;
  photos?: string[];
}): ListingCandidate {
  const view = toListingView({
    id: overrides.id,
    label: `Appt ${overrides.id}`,
    description: overrides.description ?? 'Bel appartement ventilé',
    rooms: overrides.rooms ?? 2,
    surface: overrides.surface ?? 60,
    floor: 1,
    rentAmount: overrides.rent,
    currency: 'XAF',
    status: overrides.status ?? 'AVAILABLE',
    isPublished: overrides.published ?? true,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    amenities: '["clim"]',
    building: {
      name: 'Résidence Test',
      address: '1 rue Test',
      district: overrides.district ?? 'Poto-Poto',
      city: overrides.city ?? 'Brazzaville',
      latitude: null,
      longitude: null,
    },
    organization: {
      id: 'org1',
      name: 'Agence Demo',
      type: 'AGENCY',
      isActive: overrides.orgActive ?? true,
      isValidated: overrides.orgValidated ?? true,
    },
    documents: (overrides.photos ?? ['https://cdn.example/p1.jpg']).map((url) => ({
      cloudinaryUrl: url,
      type: 'APARTMENT_PHOTO',
    })),
  });

  return {
    view,
    isPublished: overrides.published ?? true,
    orgActive: overrides.orgActive ?? true,
    orgValidated: overrides.orgValidated ?? true,
  };
}

const pool: ListingCandidate[] = [
  candidate({ id: 'a1', rent: 150_000, rooms: 2, city: 'Brazzaville', district: 'Poto-Poto' }),
  candidate({ id: 'a2', rent: 250_000, rooms: 3, city: 'Brazzaville', district: 'Moungali' }),
  candidate({ id: 'a3', rent: 180_000, rooms: 2, city: 'Pointe-Noire', district: 'Centre' }),
  candidate({ id: 'occ', rent: 140_000, rooms: 2, status: 'OCCUPIED' }),
  candidate({ id: 'unpub', rent: 140_000, rooms: 2, published: false }),
];

describe('Core Intelligence CI-1 — matching', () => {
  it('expose scorerVersion courant', () => {
    expect(SCORER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  /** B1 — contraintes impératives */
  it('B1: exclut tout logement hors budget / pièces / ville', () => {
    const demand = normalizeDemand({
      maxRent: 200_000,
      minRooms: 2,
      cities: ['Brazzaville'],
      currency: 'XAF',
    });
    const gate = filterEligible(pool, demand);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const ids = gate.eligible.map((c) => c.view.id);
    expect(ids).toContain('a1');
    expect(ids).not.toContain('a2'); // 250k > max
    expect(ids).not.toContain('a3'); // autre ville
    expect(ids.every((id) => !['occ', 'unpub'].includes(id))).toBe(true);
    for (const c of gate.eligible) {
      expect(c.view.rentAmount).toBeLessThanOrEqual(200_000);
      expect((c.view.rooms ?? 0) >= 2).toBe(true);
    }
  });

  /** B4 — logements indisponibles */
  it('B4: OCCUPIED et non publiés absents du recall', () => {
    const result = runMatchEngine(pool, { maxRent: 500_000, cities: ['Brazzaville'] });
    const ids = result.matches.map((m) => m.listing.id);
    expect(ids).not.toContain('occ');
    expect(ids).not.toContain('unpub');
    expect(result.matches.every((m) => m.listing.status === 'AVAILABLE')).toBe(true);
  });

  /** B8 — aucun résultat */
  it('B8: EMPTY_ELIGIBLE + suggestions sans inventer d’annonces', () => {
    const result = runMatchEngine(pool, {
      maxRent: 50_000,
      cities: ['Brazzaville'],
      minRooms: 5,
    });
    expect(result.matches).toEqual([]);
    expect(result.eligibleCount).toBe(0);
    expect(result.emptyReason).toBe('EMPTY_ELIGIBLE');
    expect(result.suggestions?.length).toBeGreaterThan(0);
    expect(result.scorerVersion).toBe(SCORER_VERSION);
  });

  it('classe les éligibles avec score et facteurs', () => {
    const result = runMatchEngine(pool, {
      maxRent: 200_000,
      cities: ['Brazzaville'],
      minRooms: 2,
      weights: { price: 0.5, location: 0.3, rooms: 0.1, quality: 0.1 },
    });
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]!.score).toBeGreaterThanOrEqual(result.matches.at(-1)!.score);
    expect(result.matches[0]!.factors.length).toBeGreaterThan(0);
    expect(result.matches[0]!.scorerVersion).toBe(SCORER_VERSION);
  });

  it('DTO ListingView sans fuite de champs privés', () => {
    const result = runMatchEngine(pool, { maxRent: 300_000 });
    const leaks = assertNoPrivateLeak(result);
    expect(leaks).toEqual([]);
    const json = JSON.stringify(result);
    for (const key of FORBIDDEN_LISTING_KEYS) {
      expect(json.includes(`"${key}"`)).toBe(false);
    }
    // téléphone org jamais dans ListingView
    expect(json).not.toMatch(/"phone"/);
  });

  it('marque partial=true si aucun critère hard', () => {
    const d = normalizeDemand({ text: 'je cherche un logement' });
    expect(d.partial).toBe(true);
  });
});
