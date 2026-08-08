/**
 * Extension point Vague 2 — templates documents logement / agent.
 * Vague 1 n’implémente que le contrat de location (via LeaseService PDF).
 */

export type AiDocumentKind =
  | 'LEASE_CONTRACT'
  | 'PROPERTY_INSPECTION'
  | 'PAYMENT_RECEIPT'
  | 'PAYMENT_NOTICE'
  | 'PROPERTY_SHEET'
  | 'VISIT_REPORT'
  | 'AGENT_ACTIVITY'
  | 'AGENT_MISSION'
  | 'TENANT_LETTER';

export interface DocumentGeneratorRequest {
  organizationId: string;
  kind: AiDocumentKind;
  /** Identifiants métier (apartmentId, leaseId, agentUserId, …) */
  refs: Record<string, string>;
  /** Variables déjà résolues / validées par l’utilisateur */
  variables?: Record<string, string | number | null>;
}

export interface DocumentGeneratorResult {
  kind: AiDocumentKind;
  title: string;
  /** URL PDF si généré */
  url?: string;
  /** Payload à confirmer avant génération (Vague 2) */
  preview?: Record<string, unknown>;
  supported: boolean;
  message: string;
}

/** Registre des générateurs — Vague 2 branchera les templates ici. */
export interface DocumentGenerator {
  kind: AiDocumentKind;
  label: string;
  supportedInWave: 1 | 2;
  generate(req: DocumentGeneratorRequest): Promise<DocumentGeneratorResult>;
}

const unsupported = (kind: AiDocumentKind, label: string): DocumentGenerator => ({
  kind,
  label,
  supportedInWave: 2,
  async generate() {
    return {
      kind,
      title: label,
      supported: false,
      message: `Document « ${label} » prévu en Vague 2 (templates logement/agent).`,
    };
  },
});

export const DOCUMENT_GENERATORS: DocumentGenerator[] = [
  {
    kind: 'LEASE_CONTRACT',
    label: 'Contrat de location',
    supportedInWave: 1,
    async generate(req) {
      return {
        kind: 'LEASE_CONTRACT',
        title: 'Contrat de location',
        supported: true,
        message: 'Utilisez l’action confirmée GENERATE_LEASE_PDF avec leaseId.',
        preview: { leaseId: req.refs.leaseId ?? null },
      };
    },
  },
  unsupported('PROPERTY_INSPECTION', 'État des lieux'),
  unsupported('PAYMENT_RECEIPT', 'Reçu de paiement'),
  unsupported('PAYMENT_NOTICE', 'Avis de paiement'),
  unsupported('PROPERTY_SHEET', 'Fiche logement'),
  unsupported('VISIT_REPORT', 'Rapport de visite'),
  unsupported('AGENT_ACTIVITY', 'Rapport d’activité agent'),
  unsupported('AGENT_MISSION', 'Ordre de mission'),
  unsupported('TENANT_LETTER', 'Courrier locataire'),
];

export function listDocumentCapabilities() {
  return DOCUMENT_GENERATORS.map((g) => ({
    kind: g.kind,
    label: g.label,
    wave: g.supportedInWave,
    available: g.supportedInWave === 1,
  }));
}
