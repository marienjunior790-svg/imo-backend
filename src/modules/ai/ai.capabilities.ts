/**
 * Phase J — Capability IDs mappés vers tools / méthodes EXISTANTS.
 * Ne pas ajouter de nouveaux outils OpenAI ici : router → réutiliser.
 */
export type AiCapabilityId =
  | 'PORTFOLIO_READ'
  | 'ANALYTICS'
  | 'DOC_INTEL'
  | 'PDF_LEASE'
  | 'PDF_RECEIPT'
  | 'PDF_NOTICE'
  | 'LEASE_CREATE'
  | 'MSG_INAPP'
  | 'MSG_WHATSAPP'
  | 'MEMORY'
  | 'AUTOMATION'
  | 'APP_HOWTO'
  | 'CONFIRM_PENDING'
  | 'VISION_READ'
  | 'MAINTENANCE';

/** Tools AiToolName déjà définis — référence pour le routeur. */
export const CAPABILITY_TO_TOOLS: Record<AiCapabilityId, readonly string[]> = {
  PORTFOLIO_READ: [
    'getDashboardSummary',
    'getUnits',
    'getBuildings',
    'getTenants',
    'getContracts',
    'getOutstandingPayments',
    'getVacantUnits',
    'getFinancialSummary',
    'getExpiringContracts',
    'getTeamMembers',
  ],
  ANALYTICS: [
    'analyzePortfolio',
    'compareRevenue',
    'rankBuildingsByOutstanding',
    'explainRevenueChange',
    'listUrgentIssues',
  ],
  DOC_INTEL: [
    'listDocumentsForAi',
    'summarizeDocument',
    'extractDocumentFacts',
    'askAboutDocument',
    'checkLeaseDocumentConsistency',
    'compareDocuments',
  ],
  PDF_LEASE: ['proposeGenerateLeasePdf'],
  PDF_RECEIPT: ['proposeGeneratePaymentReceipt'],
  PDF_NOTICE: ['proposeGeneratePaymentNotice'],
  LEASE_CREATE: ['proposeCreateLease'],
  MSG_INAPP: ['proposeSendTenantMessage'],
  MSG_WHATSAPP: ['proposeSendWhatsAppMessage'],
  MEMORY: ['rememberMemory', 'recallMemories', 'forgetMemory'],
  AUTOMATION: [
    'proposeOutstandingReminderAutomation',
    'proposeLeaseExpiryReminders',
    'proposeMaintenanceTasksFromTickets',
    'proposeAnomalyActions',
    'listAutomationRuns',
  ],
  APP_HOWTO: [],
  CONFIRM_PENDING: [],
  VISION_READ: [],
  MAINTENANCE: ['proposeMaintenanceTasksFromTickets'],
};
