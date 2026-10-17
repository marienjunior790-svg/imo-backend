import { toListingView } from '../../src/modules/intelligence/listing-view';
import {
  computeMarketStats,
  MARKET_STATS_VERSION,
} from '../../src/modules/intelligence/market-stats';
import type { ListingView } from '../../src/modules/intelligence/types';

function listing(id: string, rent: number, rooms: number, district = 'Poto-Poto'): ListingView {
  return toListingView({
    id,
    label: id,
    description: `${rooms} pièces`,
    rooms,
    surface: 50,
    floor: 1,
    rentAmount: rent,
    currency: 'XAF',
    status: 'AVAILABLE',
    isPublished: true,
    publishedAt: new Date(),
    amenities: null,
    building: {
      name: 'M',
      address: `${id} rue`,
      district,
      city: 'Brazzaville',
      latitude: null,
      longitude: null,
    },
    organization: {
      id: 'o',
      name: 'O',
      type: 'AGENCY',
      isActive: true,
      isValidated: true,
    },
    documents: [{ cloudinaryUrl: 'https://cdn.example/x.jpg', type: 'APARTMENT_PHOTO' }],
  });
}

describe('Core Intelligence CI-5 — MarketStats', () => {
  const pool = [
    listing('s1', 100_000, 2),
    listing('s2', 120_000, 2),
    listing('s3', 140_000, 3),
    listing('s4', 160_000, 2),
    listing('s5', 180_000, 3),
    listing('s6', 200_000, 2, 'Moungali'),
  ];

  it('version stats', () => {
    expect(MARKET_STATS_VERSION).toBe('0.1.0');
  });

  it('INSUFFICIENT_SAMPLE si N < seuil — aucun chiffre inventé', () => {
    const result = computeMarketStats(pool.slice(0, 2), {
      currency: 'XAF',
      minSample: 5,
      city: 'Brazzaville',
    });
    expect(result.status).toBe('INSUFFICIENT_SAMPLE');
    if (result.status !== 'INSUFFICIENT_SAMPLE') return;
    expect(result.sampleSize).toBe(2);
    expect(result.minSample).toBe(5);
    expect(result).not.toHaveProperty('rent');
  });

  it('agrégats réels quand N ≥ seuil', () => {
    const result = computeMarketStats(pool, {
      currency: 'XAF',
      minSample: 5,
      city: 'Brazzaville',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.sampleSize).toBe(6);
    expect(result.rent.min).toBe(100_000);
    expect(result.rent.max).toBe(200_000);
    expect(result.rent.median).toBeGreaterThanOrEqual(100_000);
    expect(result.rent.p25).toBeLessThanOrEqual(result.rent.median);
    expect(result.rent.p75).toBeGreaterThanOrEqual(result.rent.median);
    expect(result.source).toBe('opt_in_published_listings');
  });

  it('filtre district réduit l’échantillon', () => {
    const result = computeMarketStats(pool, {
      currency: 'XAF',
      minSample: 5,
      city: 'Brazzaville',
      district: 'Poto-Poto',
    });
    // 5 annonces Poto-Poto
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.sampleSize).toBe(5);
    expect(result.rent.max).toBe(180_000);
  });

  it('ne fabrique pas de stats pour une zone vide', () => {
    const result = computeMarketStats(pool, {
      currency: 'XAF',
      minSample: 5,
      city: 'Ouesso',
    });
    expect(result.status).toBe('INSUFFICIENT_SAMPLE');
    if (result.status !== 'INSUFFICIENT_SAMPLE') return;
    expect(result.sampleSize).toBe(0);
  });
});
