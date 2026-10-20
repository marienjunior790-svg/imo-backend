/**
 * Pont copilote → MatchingService (catalogue public publié).
 * Lecture seule — n’invente jamais de critères absents du message / args.
 */
import { formatDataFirstReply, MISSING_DATA_MESSAGE } from './ai.data-first.js';
import type { RawDemandInput } from '../intelligence/normalizer.js';
import type { MatchFactor, MatchResult } from '../intelligence/types.js';

const KNOWN_CITIES = ['brazzaville', 'pointe-noire', 'pointe noire', 'kinshasa'] as const;

export type CatalogMatchDemandArgs = RawDemandInput & { limit?: number };

export type CatalogMatchFactor = Pick<MatchFactor, 'key' | 'label' | 'impact' | 'weight'>;

export type CatalogMatchToolPayload = {
  source: 'public_catalog_matching';
  note: string;
  sqlMatchCount: number | null;
  sqlFetchCount: number | null;
  eligibleCount: number;
  emptyReason: 'EMPTY_ELIGIBLE' | null;
  /** Suggestions moteur EMPTY_ELIGIBLE — jamais inventées ici. */
  emptySuggestions: string[];
  scorerVersion: string;
  demandApplied: {
    maxRent?: number;
    minRent?: number;
    minRooms?: number;
    minSurface?: number;
    cities?: string[];
    districts?: string[];
    currency: string;
  };
  fieldsFromMessage: string[];
  matches: Array<{
    id: string;
    label: string;
    rooms: number | null;
    rentAmount: number;
    currency: string;
    city: string | null;
    district: string | null;
    score: number;
    /** Tous les matches outil ont passé les hard filters. */
    matchTier: 'eligible';
    /** Facteurs scorer (copie) — absents si le moteur n’en a pas fourni. */
    factors: CatalogMatchFactor[];
  }>;
  error?: string;
  code?: number | string;
};

/** Phrases « pourquoi » à partir des factors moteur uniquement (pas d’invention). */
export function explainMatchFactors(factors: CatalogMatchFactor[] | undefined, max = 3): string[] {
  if (!factors?.length) return [];
  const ranked = [...factors].sort((a, b) => b.weight - a.weight).slice(0, max);
  return ranked.map((f) => {
    const tone =
      f.impact === 'positive' ? 'favorable' : f.impact === 'negative' ? 'réserve' : 'neutre';
    return `${f.label} (${tone})`;
  });
}

function normalize(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, "'")
    .trim();
}

/** Intent catalogue public — ne vole pas « mes vacants » / « mes impayés » / parc org. */
export function isCatalogMatchQuestion(message: string): boolean {
  const q = normalize(message);
  if (!q) return false;

  // « mes / mon … » = parc org — sauf demande explicite catalogue / annonce publique
  if (
    (/\bmes\b/.test(q) || /\bmon\b/.test(q)) &&
    !q.includes('catalogue') &&
    !q.includes('annonce publ')
  ) {
    return false;
  }
  if (q.includes('impay') || q.includes('impaye') || (q.includes('retard') && q.includes('loyer'))) {
    return false;
  }

  const seek =
    q.includes('trouve') ||
    q.includes('cherche') ||
    q.includes('match') ||
    q.includes('correspondance') ||
    q.includes('catalogue') ||
    (q.includes('annonce') && (q.includes('public') || q.includes('publie')));

  const housing =
    q.includes('logement') ||
    q.includes('appart') ||
    q.includes('studio') ||
    q.includes('piece') ||
    q.includes('pièce') ||
    /\bt\d\b/.test(q) ||
    /\bf\d\b/.test(q);

  return seek && housing;
}

/**
 * Recherche catalogue explicite : ne doit jamais être absorbée par le brouillon
 * « Nouveau contrat » (loyer/pièces dans le message + historique session).
 */
export function shouldSkipLeaseDraftForCatalogSearch(message: string): boolean {
  return isCatalogMatchQuestion(message);
}

/**
 * Extrait uniquement les critères explicitement présents.
 * Pas de défaut métier inventé (pas de minRooms=1 silencieux).
 */
export function parseCatalogMatchDemand(message: string): {
  demand: CatalogMatchDemandArgs;
  fieldsFromMessage: string[];
} {
  const q = normalize(message);
  const fieldsFromMessage: string[] = [];
  const demand: CatalogMatchDemandArgs = {};

  const roomsMatch =
    q.match(/\b(\d{1,2})\s*pieces?\b/) ||
    q.match(/\bt\s*(\d{1,2})\b/) ||
    q.match(/\bf\s*(\d{1,2})\b/);
  if (roomsMatch) {
    const n = Number(roomsMatch[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 20) {
      demand.minRooms = n;
      fieldsFromMessage.push('minRooms');
    }
  }

  // « 300 000 » / « 300.000 » → digits collés pour les regex budget
  const qAmount = q.replace(/(\d)[\s.](?=\d{3}\b)/g, '$1');
  const budgetCue =
    '(?:budget|max(?:imum|imale?)?|maximal|loyer\\s+max(?:imum|imale?)?|jusqu\'?a|moins\\s+de|inferieur\\s+a|<=?)';
  const budgetK =
    qAmount.match(new RegExp(`${budgetCue}\\s*(?:de\\s*)?(\\d+)\\s*k\\b`)) ||
    qAmount.match(/\b(\d+)\s*k\s*(?:xaf|fcfa)?\b/);
  const budgetFull =
    qAmount.match(new RegExp(`${budgetCue}\\s*(?:de\\s*)?(\\d{5,8})\\b`)) ||
    qAmount.match(/\b(\d{5,8})\s*(?:xaf|fcfa)\b/);
  if (budgetK) {
    const amount = Number(budgetK[1]) * 1000;
    if (amount >= 10_000 && amount <= 50_000_000) {
      demand.maxRent = amount;
      fieldsFromMessage.push('maxRent');
    }
  } else if (budgetFull) {
    const amount = Number(budgetFull[1]);
    if (amount >= 10_000 && amount <= 50_000_000) {
      demand.maxRent = amount;
      fieldsFromMessage.push('maxRent');
    }
  }

  const cities: string[] = [];
  if (q.includes('brazzaville')) {
    cities.push('Brazzaville');
    fieldsFromMessage.push('cities');
  }
  if (q.includes('pointe-noire') || q.includes('pointe noire')) {
    cities.push('Pointe-Noire');
    if (!fieldsFromMessage.includes('cities')) fieldsFromMessage.push('cities');
  }
  if (q.includes('kinshasa')) {
    cities.push('Kinshasa');
    if (!fieldsFromMessage.includes('cities')) fieldsFromMessage.push('cities');
  }
  if (cities.length) demand.cities = cities;

  if (q.includes('xaf') || q.includes('fcfa')) {
    demand.currency = 'XAF';
    fieldsFromMessage.push('currency');
  }

  demand.limit = 5;
  return { demand, fieldsFromMessage };
}

/** Args outil → demande (sans inventer de champs absents). */
export function demandFromToolArgs(args: Record<string, unknown>): CatalogMatchDemandArgs {
  const demand: CatalogMatchDemandArgs = {};
  if (typeof args.minRooms === 'number' && Number.isInteger(args.minRooms) && args.minRooms >= 1) {
    demand.minRooms = args.minRooms;
  }
  if (typeof args.maxRent === 'number' && args.maxRent > 0) demand.maxRent = Math.round(args.maxRent);
  if (typeof args.minRent === 'number' && args.minRent >= 0) demand.minRent = Math.round(args.minRent);
  if (typeof args.minSurface === 'number' && args.minSurface > 0) demand.minSurface = args.minSurface;
  if (Array.isArray(args.cities)) {
    const cities = args.cities.map(String).map((c) => c.trim()).filter(Boolean);
    if (cities.length) demand.cities = cities;
  }
  if (Array.isArray(args.districts)) {
    const districts = args.districts.map(String).map((d) => d.trim()).filter(Boolean);
    if (districts.length) demand.districts = districts;
  }
  if (typeof args.currency === 'string' && args.currency.trim()) {
    demand.currency = args.currency.trim().toUpperCase();
  }
  if (typeof args.limit === 'number' && Number.isInteger(args.limit)) {
    demand.limit = Math.min(10, Math.max(1, args.limit));
  } else {
    demand.limit = 5;
  }
  return demand;
}

export function toCatalogMatchToolPayload(
  result: MatchResult,
  fieldsFromMessage: string[],
): CatalogMatchToolPayload {
  const sqlMatchCount = result.retrieval?.sqlMatchCount ?? null;
  return {
    source: 'public_catalog_matching',
    note:
      'Catalogue public des annonces publiées (matching ITC) — distinct du parc privé de votre organisation.',
    sqlMatchCount,
    sqlFetchCount: result.retrieval?.sqlFetchCount ?? null,
    eligibleCount: result.eligibleCount,
    emptyReason: result.emptyReason === 'EMPTY_ELIGIBLE' ? 'EMPTY_ELIGIBLE' : null,
    emptySuggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0, 6) : [],
    scorerVersion: result.scorerVersion,
    demandApplied: {
      maxRent: result.demand.maxRent,
      minRent: result.demand.minRent,
      minRooms: result.demand.minRooms,
      minSurface: result.demand.minSurface,
      cities: result.demand.cities,
      districts: result.demand.districts,
      currency: result.demand.currency,
    },
    fieldsFromMessage,
    matches: result.matches.map((m) => ({
      id: m.listing.id,
      label: m.listing.label,
      rooms: m.listing.rooms,
      rentAmount: m.listing.rentAmount,
      currency: m.listing.currency,
      city: m.listing.building?.city ?? null,
      district: m.listing.building?.district ?? null,
      score: m.score,
      matchTier: 'eligible' as const,
      factors: (m.factors ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        impact: f.impact,
        weight: f.weight,
      })),
    })),
  };
}

export function formatCatalogMatchForLocalReply(
  payload: Partial<CatalogMatchToolPayload> & { error?: string; code?: number | string },
): string {
  if (payload.error) {
    return formatDataFirstReply({
      facts: [MISSING_DATA_MESSAGE],
      analysis: [
        'Le moteur de correspondance catalogue n’a pas pu répondre (erreur technique, pas une absence de biens).',
      ],
      limits: [
        typeof payload.code !== 'undefined'
          ? `Code : ${String(payload.code)} — ${payload.error}`
          : payload.error,
      ],
    });
  }

  const sql = payload.sqlMatchCount ?? null;
  const demandApplied = payload.demandApplied ?? { currency: 'XAF' };
  const criteria = Object.entries(demandApplied)
    .filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : String(v)}`);

  const matches = payload.matches ?? [];
  const note =
    payload.note ??
    'Catalogue public des annonces publiées (matching ITC) — distinct du parc privé de votre organisation.';

  if (payload.emptyReason === 'EMPTY_ELIGIBLE' || sql === 0 || matches.length === 0) {
    const engineTips = payload.emptySuggestions?.length
      ? payload.emptySuggestions
      : ['Élargir budget, pièces ou ville, ou vérifier qu’une annonce publiée complète existe.'];
    return formatDataFirstReply({
      facts: [
        `Catalogue public : sqlMatchCount=${sql ?? 0} (aucun logement éligible).`,
        criteria.length ? `Critères appliqués : ${criteria.join(', ')}.` : 'Aucun critère hard explicite.',
        note,
      ],
      analysis: [
        'Absence de résultat = filtre hard / éligibilité, pas une invention de disponibilités.',
      ],
      recommendations: engineTips,
      limits: ['Ne pas conclure qu’un bien existe hors de sqlMatchCount / matches outils.'],
    });
  }

  const lines = matches.map((m, i) => {
    const base =
      `${i + 1}. ${m.label} — ${m.rooms ?? '?'} p. — ${m.rentAmount.toLocaleString('fr-FR')} ${m.currency}` +
      (m.city ? ` — ${m.city}` : '') +
      ` · score ${m.score}`;
    const why = explainMatchFactors(m.factors, 3);
    return why.length ? `${base} — pourquoi : ${why.join(' ; ')}` : base;
  });

  const topWhy = explainMatchFactors(matches[0]?.factors, 3);
  const fields = payload.fieldsFromMessage ?? [];
  return formatDataFirstReply({
    facts: [
      `Catalogue public : sqlMatchCount=${sql} · ${matches.length} correspondance(s) renvoyée(s) (éligibles hard).`,
      criteria.length ? `Critères appliqués : ${criteria.join(', ')}.` : 'Critères : défauts matching (devise).',
      ...lines,
      note,
    ],
    analysis: [
      topWhy.length
        ? `Meilleure proposition expliquée par le scorer ${payload.scorerVersion ?? '?'} : ${topWhy.join(' ; ')}.`
        : `Classement scorer ${payload.scorerVersion ?? '?'} parmi les biens déjà éligibles (hard) ; sqlMatchCount non réécrit.`,
      'Aucun bien hors critères hard n’est proposé.',
    ],
    recommendations: [
      'Ouvrir le détail d’une annonce dans le Store / module listings pour confirmer avant visite.',
    ],
    limits: [
      fields.length
        ? `Critères lus dans le message : ${fields.join(', ')}.`
        : 'Peu de critères extraits du message — résultats potentiellement larges.',
    ],
  });
}

/** @internal test helper — known city tokens */
export const _catalogMatchKnownCities = KNOWN_CITIES;
