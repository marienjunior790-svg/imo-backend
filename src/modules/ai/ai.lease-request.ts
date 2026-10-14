/**
 * Compréhension des demandes de contrat en langage naturel
 * (« crée un contrat pour Jean Mbemba au logement A2 à partir du 1er novembre pour 1 an, loyer 150 000 »).
 * Fonctions pures : la résolution base de données et la proposition (pending action) sont dans AiService.
 */

export const LEASE_DRAFT_MARKER = 'Nouveau contrat';

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};
const MONTH_RE = Object.keys(MONTHS).join('|');

const SMALL_NUMBERS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  dixhuit: 18,
  vingtquatre: 24,
};

/** Minuscules sans accents ; conserve chiffres et séparateurs de dates / montants. */
export function normalizeLeaseText(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9/.\-:\u202f ]+/g, ' ')
    .replace(/\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

export function leaseTokens(text: string): string[] {
  return normalizeLeaseText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function mentionsContract(text: string): boolean {
  return /\b(contrat|contrats|bail|baux)\b/.test(normalizeLeaseText(text));
}

/** Création d'un bail (enregistrement), pas seulement le document. */
export function hasLeaseCreateCue(text: string): boolean {
  const q = normalizeLeaseText(text);
  return /\b(cree|creer|creez|creons|nouveau|nouvel|nouvelle|enregistre[rz]?|ajoute[rz]?|mettre en place|faire signer)\b/.test(q);
}

/** Demande du document PDF d'un bail existant. */
export function hasLeasePdfCue(text: string): boolean {
  const q = normalizeLeaseText(text);
  return /\b(pdf|gener\w*|imprim\w*|telecharg\w*|export\w*|document)\b/.test(q);
}

/** Verbe d'action neutre (« fais / prépare / rédige un contrat »). */
export function hasLeaseMakeCue(text: string): boolean {
  const q = normalizeLeaseText(text);
  return /\b(fai[st]|faire|prepar\w*|etabli\w*|redig\w*|redaction|ecri[st]|ecrire)\b/.test(q);
}

export interface LeaseRequestFields {
  startDate?: string;
  endDate?: string;
  durationMonths?: number;
  monthlyRent?: number;
  depositAmount?: number;
  depositMonths?: number;
  activate?: boolean;
}

function iso(y: number, m: number, d: number): string | undefined {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}

function todayIso(today: Date): string {
  return iso(today.getFullYear(), today.getMonth() + 1, today.getDate())!;
}

/** Année implicite : l'année en cours, ou la suivante si la date est passée depuis plus d'un mois. */
function inferYear(m: number, d: number, today: Date): number {
  const y = today.getFullYear();
  const candidate = Date.UTC(y, m - 1, d);
  const ref = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return candidate < ref - 31 * 86_400_000 ? y + 1 : y;
}

export function addMonthsIso(startIso: string, months: number): string {
  const [y, m, d] = startIso.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

function parseAmount(raw: string, suffix?: string): number | undefined {
  const digits = raw.replace(/[\s.]/g, '');
  if (!/^\d+$/.test(digits)) return undefined;
  let value = Number(digits);
  if (suffix && /^(k|mille)$/.test(suffix.trim())) value *= 1000;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

const AMOUNT = String.raw`(\d{1,3}(?:[ .]\d{3})+|\d+)\s*(k|mille)?\b`;
const CURRENCY = String.raw`\s*(?:fcfa|cfa|xaf|f|francs?)\b`;

interface FoundDate {
  index: number;
  iso: string;
  end: boolean;
}

function collectDates(q: string, today: Date): FoundDate[] {
  const found: FoundDate[] = [];
  const taken: Array<[number, number]> = [];
  const free = (i: number, len: number) => !taken.some(([a, b]) => i < b && i + len > a);
  const push = (index: number, length: number, value: string | undefined) => {
    if (!value || !free(index, length)) return;
    taken.push([index, index + length]);
    const before = q.slice(Math.max(0, index - 14), index);
    found.push({ index, iso: value, end: /\b(au|jusqu\w*|fin|termin\w*|expir\w*|finit|finissant)\s*(au|a|le)?\s*$/.test(before) });
  };

  for (const m of q.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    push(m.index!, m[0].length, iso(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  for (const m of q.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    push(m.index!, m[0].length, iso(y, Number(m[2]), Number(m[1])));
  }
  for (const m of q.matchAll(new RegExp(String.raw`\b(\d{1,2})(?:er)?\s+(${MONTH_RE})(?:\s+(\d{4}))?\b`, 'g'))) {
    const month = MONTHS[m[2]];
    const day = Number(m[1]);
    const year = m[3] ? Number(m[3]) : inferYear(month, day, today);
    push(m.index!, m[0].length, iso(year, month, day));
  }
  for (const m of q.matchAll(new RegExp(String.raw`\b(premier|debut|fin)?\s*(?:du mois )?(?:d |de )?(${MONTH_RE})(?:\s+(\d{4}))?\b`, 'g'))) {
    const month = MONTHS[m[2]];
    const year = m[3] ? Number(m[3]) : inferYear(month, 28, today);
    const day = m[1] === 'fin' ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
    push(m.index!, m[0].length, iso(year, month, day));
  }
  for (const m of q.matchAll(/\b(aujourd hui|demain|(?:debut du |le )?mois prochain)\b/g)) {
    let value: string | undefined;
    if (m[1] === 'aujourd hui') value = todayIso(today);
    else if (m[1] === 'demain') {
      const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      value = todayIso(t);
    } else {
      const t = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      value = todayIso(t);
    }
    push(m.index!, m[0].length, value);
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Extrait dates, durée, loyer, caution et activation d'un texte libre. */
export function parseLeaseFields(text: string, today = new Date()): LeaseRequestFields {
  let q = normalizeLeaseText(text);
  const fields: LeaseRequestFields = {};

  const smallNumbers = Object.keys(SMALL_NUMBERS).join('|');
  const deposit =
    q.match(
      new RegExp(String.raw`\b(?:caution|depot de garantie|depot|garantie|avance)\s*(?:de|d|a|:|=)?\s*(\d+|${smallNumbers})\s*mois\b`),
    ) ??
    q.match(new RegExp(String.raw`\b(\d+|${smallNumbers})\s*mois\s*(?:de |d )?(?:caution|depot|garantie|avance)\b`));
  if (deposit) {
    fields.depositMonths = SMALL_NUMBERS[deposit[1]] ?? Number(deposit[1]);
    q = q.replace(deposit[0], ' ');
  } else {
    const amount = q.match(
      new RegExp(String.raw`\b(?:caution|depot de garantie|depot|garantie|avance)\s*(?:de|d|a|:|=)?\s*${AMOUNT}`),
    );
    if (amount) {
      fields.depositAmount = parseAmount(amount[1], amount[2]);
      q = q.replace(amount[0], ' ');
    }
  }

  const rent =
    q.match(new RegExp(String.raw`\b(?:loyer|mensualite|par mois|mensuel)\s*(?:mensuel\s*)?(?:de|d|a|:|=|est de)?\s*${AMOUNT}`)) ??
    q.match(new RegExp(String.raw`\b${AMOUNT}${CURRENCY}`));
  if (rent) {
    const value = parseAmount(rent[1], rent[2]);
    if (value && value >= 1000) fields.monthlyRent = value;
    q = q.replace(rent[0], ' ');
  }

  const duration = q.match(
    new RegExp(String.raw`\b(\d{1,2}|${Object.keys(SMALL_NUMBERS).join('|')})\s*(ans?|annees?|mois)\b`),
  );
  if (duration) {
    const n = SMALL_NUMBERS[duration[1]] ?? Number(duration[1]);
    const months = duration[2] === 'mois' ? n : n * 12;
    if (months > 0 && months <= 240) fields.durationMonths = months;
    q = q.replace(duration[0], ' ');
  }

  const dates = collectDates(q, today);
  const starts = dates.filter((d) => !d.end);
  const ends = dates.filter((d) => d.end);
  if (starts[0]) fields.startDate = starts[0].iso;
  if (ends[0]) fields.endDate = ends[0].iso;
  else if (starts[1]) fields.endDate = starts[1].iso;

  if (/\bactiv\w*/.test(q) && !/\b(sans|pas|ne pas)\s+(l\s+)?activ|\bbrouillon\b/.test(q)) fields.activate = true;
  if (/\bbrouillon\b|\b(sans|pas|ne pas)\s+(l\s+)?activ/.test(q)) fields.activate = false;

  return fields;
}

/** Fusion : les messages récents corrigent les précédents. */
export function mergeLeaseFields(list: LeaseRequestFields[]): LeaseRequestFields {
  const merged: LeaseRequestFields = {};
  for (const f of list) {
    for (const [k, v] of Object.entries(f)) {
      if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
    }
    if (f.depositMonths !== undefined) delete merged.depositAmount;
    if (f.depositAmount !== undefined) delete merged.depositMonths;
    if (f.durationMonths !== undefined && f.endDate === undefined) delete merged.endDate;
  }
  return merged;
}

export function hasLeaseDetails(f: LeaseRequestFields): boolean {
  return !!(f.startDate || f.endDate || f.durationMonths || f.monthlyRent || f.depositAmount || f.depositMonths);
}

export interface ResolvedLeaseDates {
  startDate: string;
  endDate: string;
  startDefaulted: boolean;
  endDefaulted: boolean;
}

export function resolveLeaseDates(f: LeaseRequestFields, today = new Date()): ResolvedLeaseDates {
  const startDate = f.startDate ?? todayIso(today);
  const endDate = f.endDate ?? addMonthsIso(startDate, f.durationMonths ?? 12);
  return {
    startDate,
    endDate,
    startDefaulted: !f.startDate,
    endDefaulted: !f.endDate && !f.durationMonths,
  };
}

const NAME_STOP = new Set([
  'contrat',
  'contrats',
  'bail',
  'pour',
  'avec',
  'cree',
  'creer',
  'nouveau',
  'logement',
  'appartement',
  'loyer',
  'caution',
  'mois',
  'ans',
  'partir',
  'madame',
  'monsieur',
  'mme',
  'mr',
  ...Object.keys(MONTHS),
]);

export interface TenantCandidate {
  id: string;
  firstName: string;
  lastName: string;
}

/** Locataires dont le nom apparaît dans le texte (meilleur score d'abord, ex-aequo inclus). */
export function matchTenantsInText<T extends TenantCandidate>(text: string, tenants: T[]): T[] {
  const tokens = leaseTokens(text).filter((t) => t.length >= 2 && !NAME_STOP.has(t) && !/^\d+$/.test(t));
  if (!tokens.length) return [];
  const scored = tenants
    .map((t) => {
      const parts = leaseTokens(`${t.firstName} ${t.lastName}`).filter((p) => p.length >= 2);
      let score = 0;
      for (const p of parts) {
        if (tokens.includes(p)) score += 2;
        else if (p.length >= 4 && tokens.some((tok) => tok.length >= 4 && p.startsWith(tok))) score += 1;
      }
      return { t, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  return scored.filter((x) => x.score === scored[0].score).map((x) => x.t);
}

export interface ApartmentCandidate {
  id: string;
  label: string;
  buildingName?: string | null;
}

const UNIT_WORDS = '(?:appartement|appart|appt|apt|logement|studio|chambre|porte|numero|no|n|lot|villa|maison|unite|local|boutique)';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Logements dont le libellé est cité (« logement A2 », « appt 3 », ou juste « A2 » en réponse). */
export function matchApartmentsInText<T extends ApartmentCandidate>(text: string, apartments: T[]): T[] {
  const q = normalizeLeaseText(text).replace(/[/.\-:]/g, ' ').replace(/\s+/g, ' ');
  const bare = q.trim();
  const scored = apartments
    .map((a) => {
      const label = normalizeLeaseText(a.label).replace(/[/.\-:]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!label) return { a, score: 0 };
      const labelRe = escapeRe(label).replace(/ /g, '\\s*');
      const lastToken = label.split(' ').pop()!;
      let score = 0;
      const numericOnly = /^\d+$/.test(label);
      if (bare === label) score = 10;
      else if (!numericOnly && label.length >= 2 && new RegExp(`\\b${labelRe}\\b`).test(q)) score = 5 + label.length;
      else if (new RegExp(`\\b${UNIT_WORDS}\\s*(?:n\\s*)?${labelRe}\\b`).test(q)) score = 5 + label.length;
      else if (lastToken !== label && new RegExp(`\\b${UNIT_WORDS}\\s*(?:n\\s*)?${escapeRe(lastToken)}\\b`).test(q)) score = 3;
      if (score && a.buildingName) {
        const building = normalizeLeaseText(a.buildingName).replace(/[/.\-:]/g, ' ').trim();
        if (building && q.includes(` ${building} `)) score += 4;
      }
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  if (!scored.length) return [];
  return scored.filter((x) => x.score === scored[0].score).map((x) => x.a);
}

export interface ChatTurnLike {
  role: string;
  content: string;
}

/**
 * Messages utilisateur du brouillon de contrat en cours (le plus ancien d'abord, message courant en dernier).
 * Un seul élément = pas de brouillon en cours.
 */
export function collectLeaseDraftMessages(message: string, history?: ChatTurnLike[]): string[] {
  const turns = history ?? [];
  const collected: string[] = [message];
  let i = turns.length - 1;
  while (i >= 1) {
    const assistant = turns[i];
    const user = turns[i - 1];
    if (assistant.role !== 'assistant' || !assistant.content.startsWith(LEASE_DRAFT_MARKER)) break;
    if (user.role !== 'user') break;
    collected.unshift(user.content);
    i -= 2;
    if (mentionsContract(user.content) && (hasLeaseCreateCue(user.content) || hasLeaseMakeCue(user.content))) break;
  }
  return collected;
}

export function leaseStatusFr(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'actif',
    DRAFT: 'brouillon',
    EXPIRED: 'expiré',
    TERMINATED: 'résilié',
  };
  return labels[status] ?? status.toLowerCase();
}

export function formatXaf(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} XAF`;
}

export function formatDateFr(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const name = Object.keys(MONTHS).find((k) => MONTHS[k] === m) ?? '';
  const pretty = name === 'fevrier' ? 'février' : name === 'aout' ? 'août' : name === 'decembre' ? 'décembre' : name;
  return `${d === 1 ? '1er' : d} ${pretty} ${y}`;
}
