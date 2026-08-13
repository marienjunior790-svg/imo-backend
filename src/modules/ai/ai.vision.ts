/**
 * Phase J3 — Vision métier ITC.
 * Analyse d’image → classification → prochaines actions réelles (maintenance / docs).
 * Pas de nouveau tool OpenAI : enrichit chatFromImage + actions routes existantes.
 */
import { classifyPriority } from '../maintenance/maintenance.service.js';
import type { AiActionHint } from './ai.fallback.js';
import type { AiSessionEntities } from './ai.memory.service.js';

export type VisionSceneKind = 'DAMAGE' | 'DOCUMENT' | 'IDENTITY' | 'PROPERTY' | 'OTHER';

export type VisionClassification = {
  kind: VisionSceneKind;
  /** Gravité suggérée pour un dégât (mots-clés + classifyPriority métier). */
  priorityHint: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  /** Indices trouvés dans le texte vision / prompt user. */
  damageSignals: string[];
  looksLikeDocument: boolean;
};

export const VISION_SYSTEM_PROMPT = `Tu es Intelligence ITC, copilote immobilier (vision).
Tu analyses des photos pour la gestion locative au Congo / XAF.
Règles :
- N’invente aucun montant, nom, adresse ou ID absents de l’image ou du contexte org.
- Si dégât / fuite / humidité / fissure / électrique : structure ta réponse ainsi :
  1) Constat (ce que tu vois)
  2) Gravité estimée (faible / moyenne / élevée / critique) + pourquoi
  3) Risques (eau, sécurité, aggravation)
  4) Prochaine action ITC recommandée (ticket maintenance desk, urgence)
- Si document / contrat / reçu / pièce d’identité : extrais le texte utile, corrige les fautes, résume les infos clés sans inventer.
- Si photo de bien (intérieur/extérieur) sans dégât évident : décris l’état apparent et l’usage (commercialisation / état des lieux).
Réponds en français, clair et pro, 4–10 lignes max hors listes.`;

function normalizeFr(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'");
}

const DAMAGE_KEYWORDS = [
  'fuite',
  'fissure',
  'humidite',
  'humidité',
  'inond',
  'degat',
  'dégât',
  'moisi',
  'moisissure',
  'plafond',
  'evier',
  'évier',
  'canalisation',
  'tuyau',
  'eau',
  'electri',
  'électri',
  'court-circuit',
  'brule',
  'brûlé',
  'incendie',
  'gaz',
  'casse',
  'cassé',
  'porte cassee',
  'vitre',
  'plomberie',
  'wc',
  'toilette',
  'urgent',
  'maintenance',
  'reparation',
  'réparation',
];

const DOC_KEYWORDS = [
  'contrat',
  'bail',
  'recu',
  'reçu',
  'quittance',
  'facture',
  'document',
  'piece',
  'pièce',
  'identite',
  'identité',
  'cni',
  'passeport',
  'signature',
  'ocr',
  'clause',
];

/**
 * Classifie le résultat vision + prompt utilisateur (sans inventer d’IDs).
 */
export function classifyVisionReading(
  reading: string,
  userPrompt?: string,
): VisionClassification {
  const blob = normalizeFr(`${userPrompt ?? ''} ${reading}`);
  const damageSignals = DAMAGE_KEYWORDS.filter((k) => blob.includes(normalizeFr(k)));
  const looksLikeDocument = DOC_KEYWORDS.some((k) => blob.includes(normalizeFr(k)));

  let kind: VisionSceneKind = 'OTHER';
  if (damageSignals.length >= 1) kind = 'DAMAGE';
  else if (
    blob.includes('cni') ||
    blob.includes('passeport') ||
    blob.includes('identite') ||
    blob.includes('identité')
  ) {
    kind = 'IDENTITY';
  } else if (looksLikeDocument) kind = 'DOCUMENT';
  else if (
    blob.includes('appartement') ||
    blob.includes('logement') ||
    blob.includes('salon') ||
    blob.includes('cuisine') ||
    blob.includes('chambre') ||
    blob.includes('immeuble')
  ) {
    kind = 'PROPERTY';
  }

  let priorityHint: VisionClassification['priorityHint'] = null;
  if (kind === 'DAMAGE') {
    const p = classifyPriority(reading.slice(0, 120), userPrompt ?? reading);
    priorityHint = p;
  }

  return { kind, priorityHint, damageSignals, looksLikeDocument };
}

export type VisionUnitHint = {
  apartmentId?: string;
  apartmentLabel?: string;
  buildingName?: string;
  tenantName?: string;
  leaseId?: string;
  source: 'session' | 'prompt_match' | 'none';
};

/**
 * Enrichit la réponse vision avec un plan d’action ITC (sans créer de ticket silencieux).
 */
export function buildVisionMetierAppendix(
  classification: VisionClassification,
  unit: VisionUnitHint,
): string {
  if (classification.kind === 'DAMAGE') {
    const unitLine =
      unit.apartmentLabel
        ? `Logement pressenti : **${unit.apartmentLabel}**${unit.buildingName ? ` (${unit.buildingName})` : ''}${
            unit.tenantName ? ` · locataire ${unit.tenantName}` : ''
          }${unit.source === 'session' ? ' (session)' : unit.source === 'prompt_match' ? ' (mentionné)' : ''}.`
        : `Logement : non identifié — précisez le libellé (ex. « Appt 3B ») ou ouvrez Maintenance.`;
    const prio = classification.priorityHint
      ? `Priorité suggérée : **${classification.priorityHint}** (à confirmer sur le ticket).`
      : 'Priorité : à évaluer sur le ticket.';
    return (
      `\n\n---\n` +
      `**Plan d’action ITC (vision métier)**\n` +
      `• ${unitLine}\n` +
      `• ${prio}\n` +
      `• Prochaine étape : créer / ouvrir un ticket Maintenance (desk), puis assigner un agent terrain.\n` +
      `• Je ne crée pas le ticket tout seul : confirmez dans Maintenance ou demandez « automatise les tâches maintenance » pour proposer des StaffTask depuis les tickets ouverts.\n` +
      (unit.leaseId ? `• Bail lié en session : \`${unit.leaseId}\` — vous pouvez demander les faits du contrat ensuite.\n` : '')
    );
  }

  if (classification.kind === 'DOCUMENT' || classification.kind === 'IDENTITY') {
    return (
      `\n\n---\n` +
      `**Suite documentaire**\n` +
      `• Faits chiffrés (loyer, dates) → demandez via le bail ITC (outils), pas uniquement l’image.\n` +
      `• OCR PDF fichier complet = pas encore ; pour un contrat enregistré : « résumé du bail de … ».\n`
    );
  }

  if (classification.kind === 'PROPERTY') {
    return (
      `\n\n---\n` +
      `**Suite parc**\n` +
      `• Pour rattacher cette photo à un logement : précisez le libellé ou ouvrez Biens / Logements.\n` +
      `• Commercialisation : « logements vacants ».\n`
    );
  }

  return '';
}

export function buildVisionMetierActions(
  classification: VisionClassification,
): AiActionHint[] {
  if (classification.kind === 'DAMAGE') {
    return [
      { label: 'Ouvrir Maintenance', route: '/maintenance' },
      { label: 'Voir les logements', route: '/properties' },
      { label: 'Voir l’équipe', route: '/team/agents' },
    ];
  }
  if (classification.kind === 'DOCUMENT' || classification.kind === 'IDENTITY') {
    return [
      { label: 'Voir les contrats', route: '/leases' },
      { label: 'Voir les paiements', route: '/payments' },
    ];
  }
  return [
    { label: 'Voir les logements', route: '/properties' },
    { label: 'Maintenance', route: '/maintenance' },
  ];
}

export function buildVisionUserPrompt(
  userPrompt: string | undefined,
  contextJson: string,
): string {
  const ask =
    userPrompt?.trim() ||
    'Analyse cette image pour la gestion immobilière ITC.';
  return (
    `${ask}\n\n` +
    `Consignes :\n` +
    `- Si dégât/fuite : constat + gravité + risques + action ticket maintenance.\n` +
    `- Si document : extrais le texte utile sans inventer.\n` +
    `- Si tu vois un libellé de logement dans le prompt utilisateur, mentionne-le.\n` +
    `\nContexte organisation (JSON, pour orientation uniquement — ne pas inventer hors image) :\n${contextJson}`
  );
}

/** Résout un hint logement depuis session + texte (pas d’invention). */
export function resolveVisionUnitHint(input: {
  session?: AiSessionEntities | null;
  userPrompt?: string;
  reading?: string;
  apartments?: Array<{
    id: string;
    label: string;
    buildingName?: string | null;
  }>;
  leases?: Array<{
    id: string;
    apartmentId: string;
    tenantName: string;
    status: string;
  }>;
}): VisionUnitHint {
  const session = input.session;
  if (session?.lastApartmentId) {
    const apt = input.apartments?.find((a) => a.id === session.lastApartmentId);
    const lease =
      input.leases?.find((l) => l.apartmentId === session.lastApartmentId && l.status === 'ACTIVE') ||
      input.leases?.find((l) => l.id === session.lastLeaseId);
    return {
      apartmentId: session.lastApartmentId,
      apartmentLabel: apt?.label ?? session.lastApartmentId,
      buildingName: apt?.buildingName ?? undefined,
      tenantName: lease?.tenantName ?? session.lastTenantName,
      leaseId: lease?.id ?? session.lastLeaseId,
      source: 'session',
    };
  }

  const blob = normalizeFr(`${input.userPrompt ?? ''} ${input.reading ?? ''}`);
  const matches =
    input.apartments?.filter((a) => {
      const label = normalizeFr(a.label);
      return label.length >= 2 && blob.includes(label);
    }) ?? [];

  if (matches.length === 1) {
    const apt = matches[0];
    const lease =
      input.leases?.find((l) => l.apartmentId === apt.id && l.status === 'ACTIVE') ||
      input.leases?.find((l) => l.apartmentId === apt.id);
    return {
      apartmentId: apt.id,
      apartmentLabel: apt.label,
      buildingName: apt.buildingName ?? undefined,
      tenantName: lease?.tenantName,
      leaseId: lease?.id,
      source: 'prompt_match',
    };
  }

  return { source: 'none' };
}
