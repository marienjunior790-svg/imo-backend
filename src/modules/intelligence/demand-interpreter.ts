import { INTERPRETER_VERSION } from './interpreter-version.js';
import type { RawDemandInput } from './normalizer.js';

/** Référentiel v0 CG — uniquement pour reconnaître des mentions explicites dans le texte. */
const CITIES: { name: string; aliases: string[] }[] = [
  { name: 'Brazzaville', aliases: ['brazzaville', 'brazza', 'bzv'] },
  { name: 'Pointe-Noire', aliases: ['pointe-noire', 'pointe noire', 'pnr', 'pointe noire'] },
  { name: 'Dolisie', aliases: ['dolisie'] },
  { name: 'Nkayi', aliases: ['nkayi'] },
  { name: 'Ouesso', aliases: ['ouesso'] },
];

const DISTRICTS_BZV: { name: string; aliases: string[] }[] = [
  { name: 'Poto-Poto', aliases: ['poto-poto', 'poto poto', 'potopoto'] },
  { name: 'Moungali', aliases: ['moungali'] },
  { name: 'Bacongo', aliases: ['bacongo'] },
  { name: 'Makélékélé', aliases: ['makelekele', 'makélékélé', 'makelekele'] },
  { name: 'Ouenzé', aliases: ['ouenze', 'ouenzé'] },
  { name: 'Talangaï', aliases: ['talangai', 'talangaï'] },
  { name: 'Madibou', aliases: ['madibou'] },
  { name: 'Djiri', aliases: ['djiri'] },
  { name: 'Mfilou', aliases: ['mfilou'] },
];

export type InterpretResult = {
  parsed: RawDemandInput;
  clarifications: string[];
  fieldsFromText: string[];
  interpreterVersion: string;
  /** true si le texte n’a fourni aucun critère hard extractible */
  incomplete: boolean;
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBudget(norm: string): { maxRent?: number; minRent?: number } {
  const out: { maxRent?: number; minRent?: number } = {};

  const parseNum = (raw: string): number | undefined => {
    const cleaned = raw.replace(/\s/g, '').replace(/,/g, '');
    if (/^\d+k$/i.test(cleaned)) return Number(cleaned.slice(0, -1)) * 1000;
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // « entre 100000 et 200000 »
  const between = norm.match(
    /entre\s+(\d[\d\s.,]*k?)\s+(?:et|a|-)\s+(\d[\d\s.,]*k?)/i,
  );
  if (between) {
    const a = parseNum(between[1]!);
    const b = parseNum(between[2]!);
    if (a != null && b != null) {
      out.minRent = Math.min(a, b);
      out.maxRent = Math.max(a, b);
      return out;
    }
  }

  // « budget max 200 000 », « jusqu'à 150000 », « <= 180000 FCFA »
  const maxPatterns = [
    /(?:budget|loyer|max(?:imum)?|jusqu['’]?a|moins de|pas plus de|plafond)\s*(?:de\s*)?(?:max(?:imum)?\s*)?(\d[\d\s.,]*k?)/i,
    /(?:<=|≤|<)\s*(\d[\d\s.,]*k?)/,
    /(\d[\d\s.,]*k?)\s*(?:fcfa|xaf|f\s*cfa|francs?)(?:\s*(?:max|maximum|par mois|\/mois))?/,
  ];
  for (const re of maxPatterns) {
    const m = norm.match(re);
    if (m) {
      const n = parseNum(m[1]!);
      if (n != null) {
        // Heuristique : montants < 1000 sans 'k' trop bas pour un loyer CG → ignorer
        if (n < 1000) continue;
        out.maxRent = n;
        break;
      }
    }
  }

  return out;
}

function parseRooms(norm: string): number | undefined {
  if (/\bstudio\b/.test(norm)) return 1;
  const f = norm.match(/\b[ft]\s*(\d)\b/);
  if (f) return Number(f[1]);
  const pieces = norm.match(/(\d+)\s*pieces?\b/);
  if (pieces) return Number(pieces[1]);
  const chambres = norm.match(/(\d+)\s*chambres?\b/);
  if (chambres) return Number(chambres[1]) + 1; // approx. pièces = chambres + séjour
  return undefined;
}

function parseSurface(norm: string): number | undefined {
  const m = norm.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²|etre|ètres|eters)?\b/);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function findPlaces(
  norm: string,
  catalog: { name: string; aliases: string[] }[],
): string[] {
  const hits: string[] = [];
  for (const item of catalog) {
    if (item.aliases.some((a) => norm.includes(a))) hits.push(item.name);
  }
  return hits;
}

/**
 * Interprète un texte libre → critères.
 * N’invente jamais de ville/quartier/budget non mentionné.
 */
export function interpretDemandText(text: string): InterpretResult {
  const clarifications: string[] = [];
  const fieldsFromText: string[] = [];
  const trimmed = text?.trim() ?? '';

  if (!trimmed) {
    return {
      parsed: {},
      clarifications: ['Précisez un budget, une ville ou un nombre de pièces.'],
      fieldsFromText: [],
      interpreterVersion: INTERPRETER_VERSION,
      incomplete: true,
    };
  }

  const norm = normalizeText(trimmed);
  const parsed: RawDemandInput = { text: trimmed };

  const budget = parseBudget(norm);
  if (budget.maxRent != null) {
    parsed.maxRent = budget.maxRent;
    fieldsFromText.push('maxRent');
  }
  if (budget.minRent != null) {
    parsed.minRent = budget.minRent;
    fieldsFromText.push('minRent');
  }

  const rooms = parseRooms(norm);
  if (rooms != null) {
    parsed.minRooms = rooms;
    fieldsFromText.push('minRooms');
  }

  const surface = parseSurface(norm);
  if (surface != null) {
    parsed.minSurface = surface;
    fieldsFromText.push('minSurface');
  }

  const cities = findPlaces(norm, CITIES);
  if (cities.length) {
    parsed.cities = cities;
    fieldsFromText.push('cities');
  }

  const districts = findPlaces(norm, DISTRICTS_BZV);
  if (districts.length) {
    parsed.districts = districts;
    fieldsFromText.push('districts');
    if (!parsed.cities?.length) {
      parsed.cities = ['Brazzaville'];
      fieldsFromText.push('cities');
    }
  }

  const incomplete = fieldsFromText.length === 0;

  if (parsed.maxRent == null) clarifications.push('Quel est votre budget loyer maximum (FCFA) ?');
  if (parsed.minRooms == null) clarifications.push('Combien de pièces minimum souhaitez-vous ?');
  if (!parsed.cities?.length && !parsed.districts?.length) {
    clarifications.push('Dans quelle ville ou quel quartier cherchez-vous ?');
  }

  // Si tout est déjà là, pas de questions inutiles
  if (parsed.maxRent != null && parsed.minRooms != null && (parsed.cities?.length || parsed.districts?.length)) {
    clarifications.length = 0;
  }

  if (incomplete) {
    clarifications.length = 0;
    clarifications.push(
      'Je n’ai extrait aucun critère précis. Indiquez par exemple : « 2 pièces à Poto-Poto, max 180000 FCFA ».',
    );
  }

  return {
    parsed,
    clarifications,
    fieldsFromText,
    interpreterVersion: INTERPRETER_VERSION,
    incomplete,
  };
}

/**
 * Fusionne champs explicites (prioritaires) + texte interprété.
 * Les champs déjà fournis dans `explicit` ne sont jamais écrasés par le parseur.
 */
export function mergeDemandWithText(explicit: RawDemandInput): {
  demand: RawDemandInput;
  interpretation: InterpretResult | null;
} {
  const { text, ...rest } = explicit;
  if (!text?.trim()) {
    return { demand: explicit, interpretation: null };
  }

  const interpretation = interpretDemandText(text);
  const fromText = interpretation.parsed;

  const demand: RawDemandInput = {
    ...fromText,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null)),
    text: text.trim(),
  };

  // Tableaux : explicit gagne s’il est non vide
  if (rest.cities?.length) demand.cities = rest.cities;
  if (rest.districts?.length) demand.districts = rest.districts;
  if (rest.weights) demand.weights = rest.weights;

  return { demand, interpretation };
}
