import type { ListingView } from './types.js';

export const MARKET_STATS_VERSION = '0.1.0';

export type MarketStatsQuery = {
  city?: string;
  district?: string;
  currency: string;
  minSample: number;
};

export type MarketStatsOk = {
  status: 'ok';
  version: string;
  asOf: string;
  currency: string;
  sampleSize: number;
  filters: { city: string | null; district: string | null };
  rent: {
    min: number;
    max: number;
    median: number;
    p25: number;
    p75: number;
  };
  rooms: {
    median: number | null;
  };
  /** Métadonnée transparente — jamais de série inventée */
  source: 'opt_in_published_listings';
};

export type MarketStatsInsufficient = {
  status: 'INSUFFICIENT_SAMPLE';
  version: string;
  asOf: string;
  currency: string;
  sampleSize: number;
  minSample: number;
  filters: { city: string | null; district: string | null };
  source: 'opt_in_published_listings';
};

export type MarketStatsResult = MarketStatsOk | MarketStatsInsufficient;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return Math.round(sorted[lo]! * (1 - w) + sorted[hi]! * w);
}

function filterListings(listings: ListingView[], query: MarketStatsQuery): ListingView[] {
  return listings.filter((l) => {
    if (l.currency.toUpperCase() !== query.currency.toUpperCase()) return false;
    if (l.status !== 'AVAILABLE') return false;
    if (query.city) {
      const c = l.building?.city?.toLowerCase() ?? '';
      if (!c.includes(query.city.toLowerCase())) return false;
    }
    if (query.district) {
      const d = l.building?.district?.toLowerCase() ?? '';
      if (!d.includes(query.district.toLowerCase())) return false;
    }
    return l.rentAmount > 0;
  });
}

/**
 * Agrégats anonymes — retourne INSUFFICIENT_SAMPLE si N < seuil (pas de chiffres inventés).
 */
export function computeMarketStats(listings: ListingView[], query: MarketStatsQuery): MarketStatsResult {
  const asOf = new Date().toISOString();
  const filters = {
    city: query.city ?? null,
    district: query.district ?? null,
  };
  const sample = filterListings(listings, query);
  const sampleSize = sample.length;

  if (sampleSize < query.minSample) {
    return {
      status: 'INSUFFICIENT_SAMPLE',
      version: MARKET_STATS_VERSION,
      asOf,
      currency: query.currency.toUpperCase(),
      sampleSize,
      minSample: query.minSample,
      filters,
      source: 'opt_in_published_listings',
    };
  }

  const rents = sample.map((l) => l.rentAmount).sort((a, b) => a - b);
  const rooms = sample.map((l) => l.rooms).filter((r): r is number => r != null).sort((a, b) => a - b);

  return {
    status: 'ok',
    version: MARKET_STATS_VERSION,
    asOf,
    currency: query.currency.toUpperCase(),
    sampleSize,
    filters,
    rent: {
      min: rents[0]!,
      max: rents[rents.length - 1]!,
      median: percentile(rents, 0.5),
      p25: percentile(rents, 0.25),
      p75: percentile(rents, 0.75),
    },
    rooms: {
      median: rooms.length ? percentile(rooms, 0.5) : null,
    },
    source: 'opt_in_published_listings',
  };
}
