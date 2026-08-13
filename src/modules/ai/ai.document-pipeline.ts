/**
 * Phase J4 — Document pipeline (faits Prisma + honnêteté OCR).
 * Upload PDF / questions contrat → faits structurés (loyer, dates, durée, anomalies).
 * OCR PDF fichier complet = NOT_SUPPORTED (proposer photo vision ou faits bail).
 * Pas de nouveau tool OpenAI.
 */
import type { AiActionHint } from './ai.fallback.js';
import type { DocumentFacts } from './ai.documents-intel.service.js';

export type DocumentAskKind =
  | 'RENT'
  | 'DATES'
  | 'DURATION'
  | 'TERMINATION'
  | 'DEPOSIT'
  | 'SUMMARY'
  | 'ANOMALIES'
  | 'QA'
  | null;

function normalizeFr(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'");
}

const NAME_STOP = new Set([
  'cree',
  'creer',
  'genere',
  'generer',
  'moi',
  'le',
  'la',
  'les',
  'un',
  'une',
  'de',
  'du',
  'des',
  'contrat',
  'contrats',
  'bail',
  'baux',
  'pdf',
  'pour',
  'avec',
  'en',
  'svp',
  'please',
  'quel',
  'quelle',
  'quels',
  'quelles',
  'est',
  'sont',
  'mon',
  'ma',
  'mes',
  'son',
  'sa',
  'ses',
  'dans',
  'sur',
  'document',
  'documents',
  'locataire',
  'logement',
  'loyer',
  'montant',
  'date',
  'debut',
  'fin',
  'duree',
  'resiliation',
  'preavis',
  'depot',
  'caution',
  'resume',
  'resumer',
  'synthese',
  'anomalie',
  'anomalies',
  'incoher',
  'verifie',
  'extrait',
  'lis',
  'lire',
  'texte',
  'clause',
  'ocr',
  'photo',
  'image',
]);

/** Intent documentaire structuré (faits Prisma) vs OCR pur. */
export function detectDocumentAskIntent(message: string): {
  kind: DocumentAskKind;
  wantsStructuredFacts: boolean;
  wantsOcrOnly: boolean;
  q: string;
} {
  const q = normalizeFr(message);
  const docCtx =
    q.includes('contrat') ||
    q.includes('bail') ||
    q.includes('document') ||
    q.includes('pdf') ||
    q.includes('recu') ||
    q.includes('quittance') ||
    q.includes('dans le') ||
    q.includes('sur le');

  const wantsOcrOnly =
    !q.includes('photo') &&
    (q.includes('ocr') ||
      (q.includes('clause') && docCtx) ||
      (q.includes('lis') && q.includes('pdf') && docCtx) ||
      (q.includes('texte') && q.includes('pdf') && docCtx)) &&
    !q.includes('loyer') &&
    !q.includes('montant') &&
    !q.includes('echeance') &&
    !q.includes('duree') &&
    !q.includes('depot') &&
    !q.includes('caution') &&
    !q.includes('resiliation') &&
    !q.includes('preavis');

  let kind: DocumentAskKind = null;
  if (
    q.includes('anomal') ||
    q.includes('incoher') ||
    (q.includes('verifie') && (q.includes('contrat') || q.includes('bail') || q.includes('document')))
  ) {
    kind = 'ANOMALIES';
  } else if (
    (q.includes('resume') || q.includes('resumer') || q.includes('synthese') || q.includes('faits')) &&
    docCtx
  ) {
    kind = 'SUMMARY';
  } else if ((q.includes('loyer') || q.includes('montant') || q.includes('rent')) && docCtx) {
    kind = 'RENT';
  } else if ((q.includes('depot') || q.includes('caution')) && docCtx) {
    kind = 'DEPOSIT';
  } else if (
    (q.includes('duree') ||
      q.includes('combien de mois') ||
      q.includes('combien de temps') ||
      q.includes('dure combien')) &&
    docCtx
  ) {
    kind = 'DURATION';
  } else if (
    (q.includes('resiliation') || q.includes('preavis') || q.includes('resilier')) &&
    docCtx
  ) {
    kind = 'TERMINATION';
  } else if (
    (q.includes('debut') ||
      q.includes('fin') ||
      q.includes('expire') ||
      q.includes('echeance') ||
      q.includes('date')) &&
    docCtx
  ) {
    kind = 'DATES';
  } else if (
    q.includes('dans le contrat') ||
    q.includes('dans mon contrat') ||
    q.includes('dans le bail') ||
    q.includes('sur le bail') ||
    q.includes('dans le pdf') ||
    q.includes('sur le pdf') ||
    q.includes('dans le document') ||
    q.includes('sur le document') ||
    q.includes('sur le recu') ||
    q.includes('dans le recu')
  ) {
    kind = 'QA';
  }

  const wantsStructuredFacts = kind != null && kind !== null;

  return { kind, wantsStructuredFacts, wantsOcrOnly, q };
}

/** Tokens utiles pour matcher un nom de locataire (hors stop-words métier). */
export function extractNameTokens(message: string): string[] {
  const q = normalizeFr(message);
  return q
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !NAME_STOP.has(t));
}

export type LeaseNameCandidate = {
  id: string;
  status: string;
  tenantFirstName: string;
  tenantLastName: string;
  apartmentLabel?: string;
};

export function scoreLeasesByTenantName<T extends LeaseNameCandidate>(
  leases: T[],
  message: string,
): Array<{ lease: T; score: number }> {
  const tokens = extractNameTokens(message);
  if (tokens.length === 0) return [];

  return leases
    .map((l) => {
      const full = normalizeFr(`${l.tenantFirstName} ${l.tenantLastName}`);
      const parts = full.split(/\s+/).filter(Boolean);
      let score = 0;
      for (const t of tokens) {
        if (full.includes(t)) score += 2;
        else if (parts.some((p) => p.startsWith(t) || t.startsWith(p))) score += 1;
      }
      if (l.status === 'ACTIVE') score += 0.5;
      return { lease: l, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
}

export function pickBestLeaseMatch<T extends LeaseNameCandidate>(
  scored: Array<{ lease: T; score: number }>,
): { lease: T; ambiguous: T[] } | null {
  if (scored.length === 0) return null;
  if (scored.length === 1 || scored[0].score >= scored[1].score + 1.5) {
    return { lease: scored[0].lease, ambiguous: [] };
  }
  const activePreferred = scored.filter((x) => x.lease.status === 'ACTIVE');
  if (activePreferred.length === 1) {
    return { lease: activePreferred[0].lease, ambiguous: [] };
  }
  return {
    lease: scored[0].lease,
    ambiguous: scored.slice(0, 6).map((x) => x.lease),
  };
}

export function formatDocumentFactsDigest(facts: DocumentFacts): string {
  const lines: string[] = ['**Faits ITC (Prisma — pas d’OCR PDF)**'];
  if (facts.parties.tenantName) lines.push(`• Locataire : ${facts.parties.tenantName}`);
  if (facts.parties.apartmentLabel) {
    lines.push(
      `• Logement : ${facts.parties.apartmentLabel}${
        facts.parties.buildingName ? ` (${facts.parties.buildingName})` : ''
      }`,
    );
  }
  if (facts.rent.monthlyRentXaf != null) {
    lines.push(
      `• Loyer : ${facts.rent.monthlyRentXaf.toLocaleString('fr-FR')} ${facts.rent.currency ?? 'XAF'}/mois`,
    );
  }
  if (facts.rent.depositXaf != null) {
    lines.push(
      `• Caution : ${facts.rent.depositXaf.toLocaleString('fr-FR')} ${facts.rent.currency ?? 'XAF'}`,
    );
  }
  if (facts.dates.startDate) lines.push(`• Début : ${facts.dates.startDate}`);
  if (facts.dates.endDate) lines.push(`• Fin : ${facts.dates.endDate}`);
  const duration = computeLeaseDurationMonths(facts.dates.startDate, facts.dates.endDate);
  if (duration != null) lines.push(`• Durée : ~${duration} mois`);
  if (facts.status.leaseStatus) lines.push(`• Statut bail : ${facts.status.leaseStatus}`);
  if (facts.leaseId) lines.push(`• leaseId : \`${facts.leaseId}\``);
  if (facts.sourceUrl) lines.push(`• URL PDF enregistrée : ${facts.sourceUrl}`);
  lines.push(
    `• Extraction texte PDF : ${
      facts.textExtraction === 'BUFFER_EXCERPT'
        ? 'extrait terms disponible'
        : 'NOT_SUPPORTED (métadonnées / champs structurés uniquement)'
    }`,
  );
  if (facts.excerpt) lines.push(`• Extrait terms : ${facts.excerpt.slice(0, 280)}`);
  return lines.join('\n');
}

export function computeLeaseDurationMonths(
  startDate: string | null,
  endDate: string | null,
): number | null {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  const months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(1, months);
}

/** Réponse bridge quand l’utilisateur envoie un PDF (vision endpoint). */
export function buildPdfUploadPipelineReply(input: {
  facts: DocumentFacts | null;
  userPrompt?: string;
  ambiguousLeases?: LeaseNameCandidate[];
}): string {
  const header =
    `PDF reçu. **OCR fichier PDF complet : NOT_SUPPORTED** pour l’instant.\n` +
    `Je m’appuie sur les **faits structurés ITC** (bail / paiement liés), pas sur le binaire PDF.\n\n`;

  if (input.ambiguousLeases && input.ambiguousLeases.length > 1) {
    const list = input.ambiguousLeases
      .map(
        (l, i) =>
          `${i + 1}. ${l.tenantFirstName} ${l.tenantLastName}` +
          (l.apartmentLabel ? ` — ${l.apartmentLabel}` : '') +
          ` (${l.status}) · \`${l.id}\``,
      )
      .join('\n');
    return (
      header +
      `Plusieurs baux correspondent au prompt. Précisez le locataire ou le leaseId :\n\n${list}\n\n` +
      `Ensuite : « résumé du bail de … », « quel est le loyer du bail de … », ou envoyez une **photo** nette du contrat (vision).`
    );
  }

  if (input.facts) {
    return (
      header +
      formatDocumentFactsDigest(input.facts) +
      `\n\nSuite possible : « anomalies du bail », « compare les baux <idA> et <idB> », ` +
      `« prépare une relance WhatsApp pour l’impayé », ou photo pour lire une clause manuscrite.`
    );
  }

  return (
    header +
    `Aucun bail / document ITC rattaché automatiquement` +
    (input.userPrompt?.trim() ? ` depuis « ${input.userPrompt.trim().slice(0, 80)} »` : '') +
    `.\n\n` +
    `• Indiquez le locataire : « résumé du bail de Yannick »\n` +
    `• Ou un leaseId / ouvrez Contrats\n` +
    `• Ou envoyez une **photo** nette (JPG/PNG) pour lecture vision`
  );
}

export function buildDocumentPipelineActions(
  kind: DocumentAskKind,
): AiActionHint[] {
  const base: AiActionHint[] = [
    { label: 'Voir les contrats', route: '/leases' },
    { label: 'Voir les paiements', route: '/payments' },
  ];
  if (kind === 'ANOMALIES') {
    return [{ label: 'Voir les contrats', route: '/leases' }, { label: 'Maintenance', route: '/maintenance' }];
  }
  return base;
}

/** Question enrichie pour answerDocumentQuestion selon l’intent. */
export function questionForDocumentAsk(kind: DocumentAskKind, original: string): string {
  switch (kind) {
    case 'RENT':
      return 'quel est le loyer';
    case 'DEPOSIT':
      return 'quel est le dépôt caution';
    case 'DATES':
      return original;
    case 'DURATION':
      return 'quelle est la durée du bail';
    case 'TERMINATION':
      return 'quelles sont les conditions de résiliation préavis';
    default:
      return original;
  }
}
