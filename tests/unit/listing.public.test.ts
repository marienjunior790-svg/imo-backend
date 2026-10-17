import {
  assertNoPrivateLeak,
  FORBIDDEN_LISTING_KEYS,
  toListingView,
} from '../../src/modules/intelligence/listing-view';
import { buildRetrievalMeta, MATCH_CANDIDATE_RECALL_LIMIT, withRetrievalMeta } from '../../src/modules/intelligence/retrieval';
import { runMatchEngine } from '../../src/modules/intelligence/matching.engine';
import type { ListingCandidate } from '../../src/modules/intelligence/types';

function sourceWithPhoneAttempt() {
  return {
    id: 'apt-public-1',
    label: 'Studio Centre',
    description: 'Studio ventilé',
    rooms: 1,
    surface: 28,
    floor: 0,
    rentAmount: 120_000,
    currency: 'XAF',
    status: 'AVAILABLE',
    isPublished: true,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    amenities: '["clim"]',
    building: {
      name: 'Immeuble A',
      address: '10 rue Test',
      district: 'Poto-Poto',
      city: 'Brazzaville',
      latitude: null,
      longitude: null,
    },
    organization: {
      id: 'org-1',
      name: 'Agence Demo',
      type: 'AGENCY',
      isActive: true,
      isValidated: true,
      // Simule une fuite potentielle côté Prisma — ne doit jamais apparaître dans le DTO
      phone: '+242060000000',
      email: 'secret@example.com',
    } as {
      id: string;
      name: string;
      type: string;
      isActive: boolean;
      isValidated: boolean;
      phone?: string;
      email?: string;
    },
    documents: [{ cloudinaryUrl: 'https://cdn.example/p1.jpg', type: 'APARTMENT_PHOTO' }],
  };
}

describe('Catalogue public listings — anti-fuite (P0)', () => {
  it('toListingView n’expose ni phone ni email org', () => {
    const view = toListingView(sourceWithPhoneAttempt());
    expect(view.organization).toEqual({
      id: 'org-1',
      name: 'Agence Demo',
      type: 'AGENCY',
    });
    expect(view.organization).not.toHaveProperty('phone');
    expect(view.organization).not.toHaveProperty('email');
    expect(assertNoPrivateLeak(view)).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/"phone"/);
    expect(json).not.toMatch(/"email"/);
    for (const key of FORBIDDEN_LISTING_KEYS) {
      expect(json.includes(`"${key}"`)).toBe(false);
    }
  });
});

describe('Match retrieval meta (P1)', () => {
  it('truncated=false sous le cap', () => {
    const meta = buildRetrievalMeta(120, MATCH_CANDIDATE_RECALL_LIMIT);
    expect(meta.truncated).toBe(false);
    expect(meta.candidateCount).toBe(120);
    expect(meta.recallLimit).toBe(MATCH_CANDIDATE_RECALL_LIMIT);
    expect(meta.strategy).toBe('published_at_desc_take');
  });

  it('truncated=true à la limite de rappel', () => {
    const meta = buildRetrievalMeta(MATCH_CANDIDATE_RECALL_LIMIT, MATCH_CANDIDATE_RECALL_LIMIT);
    expect(meta.truncated).toBe(true);
  });

  it('withRetrievalMeta attache la méta sans casser le ranking', () => {
    const candidates: ListingCandidate[] = [
      {
        view: toListingView(sourceWithPhoneAttempt()),
        isPublished: true,
        orgActive: true,
        orgValidated: true,
      },
    ];
    const base = runMatchEngine(candidates, { maxRent: 200_000, cities: ['Brazzaville'] });
    const withMeta = withRetrievalMeta(base, MATCH_CANDIDATE_RECALL_LIMIT);
    expect(withMeta.retrieval?.truncated).toBe(true);
    expect(withMeta.matches.length).toBe(base.matches.length);
    expect(assertNoPrivateLeak(withMeta)).toEqual([]);
  });
});
