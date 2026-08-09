/**
 * Templates documents IA — Vague 1 (contrat) + Vague 2 (reçu / avis).
 * Les PDF métier sont générés via LeaseService / PaymentService après confirmation.
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
  /** Identifiants métier (apartmentId, leaseId, paymentId, agentUserId, …) */
  refs: Record<string, string>;
  /** Variables déjà résolues / validées par l’utilisateur */
  variables?: Record<string, string | number | null>;
}

export interface DocumentGeneratorResult {
  kind: AiDocumentKind;
  title: string;
  /** URL PDF si généré */
  url?: string;
  /** Payload à confirmer avant génération */
  preview?: Record<string, unknown>;
  supported: boolean;
  message: string;
}

export interface DocumentGenerator {
  kind: AiDocumentKind;
  label: string;
  supportedInWave: 1 | 2;
  /** Disponible côté API (propose + confirm) */
  available: boolean;
  generate(req: DocumentGeneratorRequest): Promise<DocumentGeneratorResult>;
}

const unsupported = (kind: AiDocumentKind, label: string): DocumentGenerator => ({
  kind,
  label,
  supportedInWave: 2,
  available: false,
  async generate() {
    return {
      kind,
      title: label,
      supported: false,
      message: `Document « ${label} » prévu prochainement (templates logement/agent).`,
    };
  },
});

export const DOCUMENT_GENERATORS: DocumentGenerator[] = [
  {
    kind: 'LEASE_CONTRACT',
    label: 'Contrat de location',
    supportedInWave: 1,
    available: true,
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
  {
    kind: 'PAYMENT_RECEIPT',
    label: 'Reçu de paiement',
    supportedInWave: 2,
    available: true,
    async generate(req) {
      return {
        kind: 'PAYMENT_RECEIPT',
        title: 'Reçu de paiement',
        supported: true,
        message: 'Utilisez l’action confirmée GENERATE_PAYMENT_RECEIPT avec paymentId.',
        preview: { paymentId: req.refs.paymentId ?? null },
      };
    },
  },
  {
    kind: 'PAYMENT_NOTICE',
    label: 'Avis de paiement',
    supportedInWave: 2,
    available: true,
    async generate(req) {
      return {
        kind: 'PAYMENT_NOTICE',
        title: 'Avis de paiement',
        supported: true,
        message: 'Utilisez l’action confirmée GENERATE_PAYMENT_NOTICE avec paymentId.',
        preview: { paymentId: req.refs.paymentId ?? null },
      };
    },
  },
  unsupported('PROPERTY_INSPECTION', 'État des lieux'),
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
    available: g.available,
  }));
}
