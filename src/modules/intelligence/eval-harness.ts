import {
  GOLD_B2_DISTRICT_DEMAND,
  GOLD_B2_DISTRICT_EXPECTED_ORDER,
  GOLD_B2_DISTRICT_GRADES,
  GOLD_B2_PRICE_DEMAND,
  GOLD_B2_PRICE_EXPECTED_TOP3,
  GOLD_B2_PRICE_GRADES,
  goldB2Corpus,
} from './gold/b2-weighted.js';
import { runMatchEngine } from './matching.engine.js';
import { ndcgAtK, precisionAtK, relevancesForRanking } from './metrics.js';
import { SCORER_VERSION } from './scorer-version.js';

export type GoldCaseResult = {
  id: string;
  pass: boolean;
  ndcg10: number;
  precision3: number;
  rankedIds: string[];
  expectedTop: string[];
  scorerVersion: string;
  detail?: string;
};

const NDCG_MIN = 0.85;

export function runGoldB2Suite(): GoldCaseResult[] {
  const corpus = goldB2Corpus();

  const district = runMatchEngine(corpus, GOLD_B2_DISTRICT_DEMAND);
  const districtIds = district.matches.map((m) => m.listing.id);
  const districtRel = relevancesForRanking(districtIds, GOLD_B2_DISTRICT_GRADES);
  const districtNdcg = ndcgAtK(districtRel, 10);
  const districtOrderOk =
    districtIds.length >= GOLD_B2_DISTRICT_EXPECTED_ORDER.length &&
    GOLD_B2_DISTRICT_EXPECTED_ORDER.every((id, i) => districtIds[i] === id);

  const price = runMatchEngine(corpus, GOLD_B2_PRICE_DEMAND);
  const priceIds = price.matches.map((m) => m.listing.id);
  const priceRel = relevancesForRanking(priceIds, GOLD_B2_PRICE_GRADES);
  const priceNdcg = ndcgAtK(priceRel, 10);
  const priceTop3 = priceIds.slice(0, 3);
  const priceOrderOk = GOLD_B2_PRICE_EXPECTED_TOP3.every((id, i) => priceTop3[i] === id);
  const priceHits = priceIds.slice(0, 3).map((id) => (GOLD_B2_PRICE_GRADES[id] ?? 0) >= 2);

  return [
    {
      id: 'B2-district-hard',
      pass: districtOrderOk && districtNdcg >= NDCG_MIN,
      ndcg10: districtNdcg,
      precision3: precisionAtK(
        districtIds.slice(0, 3).map((id) => (GOLD_B2_DISTRICT_GRADES[id] ?? 0) >= 2),
        3,
      ),
      rankedIds: districtIds,
      expectedTop: [...GOLD_B2_DISTRICT_EXPECTED_ORDER],
      scorerVersion: SCORER_VERSION,
      detail: districtOrderOk ? undefined : `ordre=${districtIds.join(',')}`,
    },
    {
      id: 'B2-price-weighted',
      pass: priceOrderOk && priceNdcg >= NDCG_MIN,
      ndcg10: priceNdcg,
      precision3: precisionAtK(priceHits, 3),
      rankedIds: priceIds,
      expectedTop: [...GOLD_B2_PRICE_EXPECTED_TOP3],
      scorerVersion: SCORER_VERSION,
      detail: priceOrderOk ? undefined : `top3=${priceTop3.join(',')}`,
    },
  ];
}

export function goldSuitePassed(results = runGoldB2Suite()): boolean {
  return results.every((r) => r.pass);
}
