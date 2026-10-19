/**
 * Retrieval lexical V1 — corpus formation immobilière (hors données org).
 * Pas de vector DB. Pas de statut verified inventé.
 */

import { FORMATION_CORPUS_V1 } from './ai.formation-corpus.v1.js';
import type {
  FormationCorpusFile,
  FormationKnowledgeCard,
  FormationSearchHit,
} from './ai.formation-knowledge.types.js';

const STOP = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'et',
  'ou',
  'a',
  'à',
  'en',
  'pour',
  'par',
  'sur',
  'au',
  'aux',
  'ce',
  'ces',
  'que',
  'qui',
  'dans',
  'avec',
  'comment',
  'quoi',
  'quel',
  'quelle',
  'est',
  'sont',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, "'");
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9%]+/i)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function cardSearchBlob(card: FormationKnowledgeCard): string {
  return [
    card.id,
    card.title,
    card.category,
    card.content,
    card.keywords.join(' '),
    card.method.summary,
    card.method.steps.join(' '),
    ...card.formulas.map((f) => `${f.name} ${f.expression}`),
    ...card.examples.map((e) => e.text),
  ].join(' ');
}

function scoreCard(queryTokens: string[], card: FormationKnowledgeCard): number {
  if (!queryTokens.length) return 0;
  const blob = normalize(cardSearchBlob(card));
  const title = normalize(card.title);
  const keywords = new Set(card.keywords.map((k) => normalize(k)));
  let score = 0;
  for (const t of queryTokens) {
    if (title.includes(t)) score += 4;
    if ([...keywords].some((k) => k.includes(t) || t.includes(k))) score += 3;
    if (blob.includes(t)) score += 1;
  }
  // Pénalité si pas encore verified (transparence ranking — toujours indexable en candidate)
  if (card.verificationStatus === 'unverified') score *= 0.95;
  if (card.verificationStatus === 'verified') score *= 1.05;
  return score;
}

function excerpt(card: FormationKnowledgeCard, max = 320): string {
  const base = card.content.trim();
  if (base.length <= max) return base;
  return `${base.slice(0, max - 1)}…`;
}

export function getFormationCorpus(): FormationCorpusFile {
  return FORMATION_CORPUS_V1;
}

export function listFormationCards(includeRetired = false): FormationKnowledgeCard[] {
  return FORMATION_CORPUS_V1.cards.filter((c) => includeRetired || !c.retired);
}

/** Recherche lexicale top-K — corpus global formation (pas scopé org). */
export function searchFormationKnowledge(
  query: string,
  options?: { topK?: number },
): {
  corpusVersion: string;
  query: string;
  count: number;
  hits: FormationSearchHit[];
  note: string;
} {
  const topK = Math.min(Math.max(options?.topK ?? 3, 1), 8);
  const qTokens = tokens(query);
  const ranked = listFormationCards()
    .map((card) => ({ card, score: scoreCard(qTokens, card) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const hits: FormationSearchHit[] = ranked.map(({ card, score }) => ({
    cardId: card.id,
    title: card.title,
    category: card.category,
    score: Math.round(score * 100) / 100,
    verificationStatus: card.verificationStatus,
    timestampStart: card.source.timestampStart,
    timestampEnd: card.source.timestampEnd,
    excerpt: excerpt(card),
    formulas: card.formulas.map((f) => f.expression),
    warnings: [...card.warnings, ...card.limitations].slice(0, 4),
    sourceUrl: card.source.url,
  }));

  return {
    corpusVersion: FORMATION_CORPUS_V1.manifest.corpusVersion,
    query,
    count: hits.length,
    hits,
    note:
      hits.length === 0
        ? 'Aucun passage formation pertinent dans le corpus v1 (couverture partielle, statut unverified).'
        : 'Passages formation (secondaires). verificationStatus=unverified tant que le transcript n’est pas validé. Les faits portefeuille restent les outils Prisma org.',
  };
}

/** Intent heuristique : question de savoir formation vs parc ITC. */
export function isFormationKnowledgeQuestion(message: string): boolean {
  const q = normalize(message);
  const cues = [
    'rendement brut',
    'rentabilite brute',
    'rentabilité brute',
    'comment calculer',
    'psychologie',
    'epargne',
    'épargne',
    'bien moche',
    'dessous du marche',
    'dessous du marché',
    'dvf',
    'studio en t2',
    'transformer un studio',
    'secteur sauvegarde',
    'secteur sauvegardé',
    'abf',
    'credit immobilier',
    'crédit immobilier',
    'taux d\'endettement',
    'formation immobilier',
    'conseil d\'investissement',
    'strategie d\'achat',
    'stratégie d\'achat',
  ];
  return cues.some((c) => q.includes(normalize(c)));
}

export function formatFormationHitsForPrompt(result: ReturnType<typeof searchFormationKnowledge>): string {
  if (!result.hits.length) {
    return `## Savoir formation (corpus ${result.corpusVersion})\nAucun hit. ${result.note}`;
  }
  const lines = result.hits.map(
    (h, i) =>
      `${i + 1}. [${h.cardId}] ${h.title} (${h.verificationStatus}` +
      `${h.timestampStart && h.timestampEnd ? `, ${h.timestampStart}-${h.timestampEnd}` : ''})\n` +
      `   ${h.excerpt}` +
      (h.formulas.length ? `\n   Formule(s) : ${h.formulas.join(' | ')}` : '') +
      (h.warnings.length ? `\n   Avertissements : ${h.warnings.join(' ; ')}` : ''),
  );
  return (
    `## Savoir formation (corpus ${result.corpusVersion}) — SECONDAIRE\n` +
    `${result.note}\n\n` +
    lines.join('\n\n')
  );
}
