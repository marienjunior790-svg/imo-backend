import { inject, injectable } from 'tsyringe';
import {
  AiAutomationKind,
  AiMemoryKind,
  AiMemoryScope,
  ApartmentStatus,
  LeaseStatus,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import type OpenAI from 'openai';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AppError, ForbiddenError } from '../../shared/errors/app.error.js';
import { normalizeRole } from '../../shared/auth/roles.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { TeamMembersService } from '../admin/team-members.service.js';
import { AiContextService } from './ai.context.service.js';
import { AiAnalyticsService } from './ai.analytics.service.js';
import { AiAutomationService } from './ai.automation.service.js';
import { utcLastMonth, utcThisMonth } from './ai.analytics.math.js';
import {
  AiDocumentsIntelService,
  extractCuidFromText,
} from './ai.documents-intel.service.js';
import { AiMemoryService, type AiSessionEntities } from './ai.memory.service.js';
import {
  detectReferentialIntent,
  enrichLocalIntents,
  type ChatHistoryTurn,
} from './ai.context-manager.js';
import { env, isAiMemoryEnabled, isWhatsAppConfigured } from '../../config/env.js';
import { isValidWhatsAppPhone, normalizePhoneE164 } from '../../shared/utils/phone.util.js';

export type AiToolName =
  | 'getDashboardSummary'
  | 'getOutstandingPayments'
  | 'getVacantUnits'
  | 'getUnits'
  | 'getBuildings'
  | 'getContracts'
  | 'getTenants'
  | 'getFinancialSummary'
  | 'getExpiringContracts'
  | 'getTeamMembers'
  | 'analyzePortfolio'
  | 'compareRevenue'
  | 'rankBuildingsByOutstanding'
  | 'explainRevenueChange'
  | 'listUrgentIssues'
  | 'listDocumentsForAi'
  | 'summarizeDocument'
  | 'extractDocumentFacts'
  | 'askAboutDocument'
  | 'checkLeaseDocumentConsistency'
  | 'compareDocuments'
  | 'proposeGenerateLeasePdf'
  | 'proposeGeneratePaymentReceipt'
  | 'proposeGeneratePaymentNotice'
  | 'proposeCreateLease'
  | 'proposeSendTenantMessage'
  | 'proposeSendWhatsAppMessage'
  | 'proposeSendWhatsAppMedia'
  | 'rememberMemory'
  | 'recallMemories'
  | 'forgetMemory'
  | 'proposeOutstandingReminderAutomation'
  | 'proposeLeaseExpiryReminders'
  | 'proposeMaintenanceTasksFromTickets'
  | 'proposeAnomalyActions'
  | 'listAutomationRuns';

export type AiToolExecuteCtx = { userId: string; role: UserRole };

/** Intent local avec arguments (organizationId jamais dans args — injecté côté service). */
export type LocalToolIntent = {
  name: AiToolName;
  args?: Record<string, unknown>;
};

export const OPENAI_TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getDashboardSummary',
      description: 'Résumé du patrimoine : biens, occupation, locataires, impayés, encaissements du mois.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getOutstandingPayments',
      description:
        'Liste les loyers à encaisser : PENDING + PARTIAL + LATE (impayés / à payer / partiels). Montants restants réels. ' +
        'period optionnel : last_month | this_month (filtre periodMonth/periodYear).',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['last_month', 'this_month'],
            description: 'Filtre la période de loyer (mois calendaire UTC).',
          },
          tenantId: {
            type: 'string',
            description: 'Filtrer sur un locataire (cuid) si connu.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVacantUnits',
      description: 'Logements vacants / disponibles (statut AVAILABLE).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getUnits',
      description:
        'Liste les logements / appartements du parc (occupés, vacants, maintenance…). ' +
        'Utiliser pour « mes logements », « combien de biens », « montre mon patrimoine détaillé ».',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filtre optionnel : AVAILABLE | OCCUPIED | MAINTENANCE | UNAVAILABLE',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBuildings',
      description: 'Liste les immeubles de l’organisation avec effectifs logements.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getContracts',
      description: 'Contrats de location récents (actifs, brouillon, expirés).',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'ACTIVE | DRAFT | EXPIRED | TERMINATED (optionnel)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTenants',
      description: 'Liste des locataires de l’organisation.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getFinancialSummary',
      description: 'Synthèse financière : encaissé ce mois, potentiel, impayés, en attente.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getExpiringContracts',
      description: 'Contrats arrivant à échéance sous 30 jours.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTeamMembers',
      description:
        'Liste les collaborateurs / agents de l’organisation authentifiée (équipe). ' +
        'Pour « mes agents » / liste des agents terrain, passer role=AGENT. ' +
        'Ne pas utiliser pour l’assignation maintenance (agents terrain disponibles à l’affectation). ' +
        'Ne jamais inventer de noms — uniquement les membres retournés. ' +
        'Ne jamais passer organizationId (imposé par le serveur).',
      parameters: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            description: 'Filtre rôle Prisma : AGENT | MANAGER | ACCOUNTANT | OWNER | …',
          },
          status: {
            type: 'string',
            description: 'active | inactive | all (défaut all)',
          },
          search: {
            type: 'string',
            description: 'Recherche prénom, nom, e-mail ou téléphone',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyzePortfolio',
      description:
        'Synthèse analytique du parc (KPIs calculés Prisma) : occupation, impayés, encaissements, ' +
        'top immeubles en impayés, problèmes urgents, comparaison mois. Ne jamais inventer de chiffres.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['synthesis', 'snapshot'],
            description: 'synthesis (défaut) = vue croisée ; snapshot = KPIs seuls',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compareRevenue',
      description:
        'Compare les encaissements (somme amountPaid PAID|PARTIAL) entre deux périodes periodMonth/periodYear UTC. ' +
        'Sans args : mois dernier vs ce mois.',
      parameters: {
        type: 'object',
        properties: {
          periodAMonth: { type: 'number', description: 'Mois 1-12 période A (défaut = mois dernier)' },
          periodAYear: { type: 'number', description: 'Année période A' },
          periodBMonth: { type: 'number', description: 'Mois 1-12 période B (défaut = ce mois)' },
          periodBYear: { type: 'number', description: 'Année période B' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rankBuildingsByOutstanding',
      description:
        'Classe les immeubles par total d’impayés restants (PENDING+PARTIAL+LATE). Calcul Prisma réel.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Nombre max d’immeubles (défaut 5)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explainRevenueChange',
      description:
        'Explique l’évolution des encaissements ce mois vs mois dernier à partir de facteurs mesurés ' +
        '(encaissé, impayés, occupation, LATE). Si données insuffisantes : sufficient=false.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listUrgentIssues',
      description:
        'Liste priorisée de problèmes urgents réels : LATE, PENDING hors délai, baux expirés / bientôt finis, ' +
        'maintenance haute priorité, vacants sans bail.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Nombre max (défaut 5)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listDocumentsForAi',
      description:
        'Liste les documents analysables de l’organisation (table Document + baux avec contractPdfUrl + paiements avec receiptPdfUrl). ' +
        'Métadonnées uniquement — pas d’OCR PDF ni de RAG.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarizeDocument',
      description:
        'Résume un document / contrat / reçu à partir des métadonnées Prisma liées (locataire, logement, montants, dates, URL Cloudinary). ' +
        'N’invente pas le contenu OCR du PDF.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string' },
          leaseId: { type: 'string' },
          paymentId: { type: 'string' },
          kind: { type: 'string', description: 'LEASE_PDF | PAYMENT_RECEIPT | PAYMENT_NOTICE (optionnel)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extractDocumentFacts',
      description:
        'Extrait des faits structurés (parties, loyer, dates, statut) depuis Document/bail/paiement. Jamais inventés.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string' },
          leaseId: { type: 'string' },
          paymentId: { type: 'string' },
          kind: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'askAboutDocument',
      description:
        'Répond à une question UNIQUEMENT à partir des faits extraits du dossier ITC. ' +
        'Si l’info n’est pas dans les faits : message d’indisponibilité explicite.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          documentId: { type: 'string' },
          leaseId: { type: 'string' },
          paymentId: { type: 'string' },
          kind: { type: 'string' },
        },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkLeaseDocumentConsistency',
      description:
        'Vérifie des incohérences règle-based sur un bail : loyer vs logement, locataire concurrent, statut vs dates.',
      parameters: {
        type: 'object',
        properties: {
          leaseId: { type: 'string', description: 'ID du bail (cuid)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compareDocuments',
      description:
        'Compare deux baux (leaseIdA + leaseIdB) sur faits structurés. Sans deux leaseId : NOT_SUPPORTED.',
      parameters: {
        type: 'object',
        properties: {
          leaseIdA: { type: 'string' },
          leaseIdB: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeGenerateLeasePdf',

      description:
        'Propose la génération d’un contrat PDF professionnel. Ne génère PAS immédiatement — l’utilisateur doit confirmer.',
      parameters: {
        type: 'object',
        properties: {
          leaseId: { type: 'string', description: 'ID du bail (cuid). Optionnel pour lister les baux.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeGeneratePaymentReceipt',
      description:
        'Propose un reçu/quittance PDF pour un paiement déjà enregistré (PAID/PARTIAL). Confirmation utilisateur obligatoire.',
      parameters: {
        type: 'object',
        properties: {
          paymentId: { type: 'string', description: 'ID du paiement (cuid). Optionnel pour lister les paiements payés.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeGeneratePaymentNotice',
      description:
        'Propose un avis de paiement PDF (rappel de loyer) pour PENDING/LATE/PARTIAL. Confirmation utilisateur obligatoire.',
      parameters: {
        type: 'object',
        properties: {
          paymentId: { type: 'string', description: 'ID du paiement (cuid). Optionnel pour lister les impayés / en attente.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeCreateLease',
      description:
        'Propose la création d’un contrat/bail (enregistrement métier, pas PDF). ' +
        'Valide locataire + logement dans l’org. Ne crée PAS immédiatement — confirmation obligatoire. ' +
        'Ne jamais inventer d’IDs ni de montants.',
      parameters: {
        type: 'object',
        properties: {
          tenantId: { type: 'string', description: 'ID locataire (cuid)' },
          apartmentId: { type: 'string', description: 'ID logement (cuid)' },
          startDate: { type: 'string', description: 'Date début ISO (YYYY-MM-DD)' },
          endDate: { type: 'string', description: 'Date fin ISO (YYYY-MM-DD)' },
          monthlyRent: { type: 'number', description: 'Loyer mensuel XAF (optionnel — défaut = loyer du logement)' },
          depositAmount: { type: 'number', description: 'Caution XAF (optionnel)' },
          terms: { type: 'string', description: 'Clauses particulières (optionnel)' },
          activate: {
            type: 'boolean',
            description: 'Si true, activer le bail après création. Défaut false (brouillon).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeSendTenantMessage',
      description:
        'Propose d’envoyer un message interne au locataire (compte portail). ' +
        'Pas un avis PDF. Confirmation utilisateur obligatoire. Ne jamais inventer de destinataire.',
      parameters: {
        type: 'object',
        properties: {
          tenantId: { type: 'string', description: 'ID locataire (cuid)' },
          tenantName: { type: 'string', description: 'Nom à rechercher si pas d’ID' },
          subject: { type: 'string', description: 'Objet du message' },
          body: { type: 'string', description: 'Corps du message' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeSendWhatsAppMessage',
      description:
        'Propose d’envoyer un message WhatsApp (Meta Cloud API) au locataire. ' +
        'Confirmation obligatoire. Ne jamais inventer de numéro. Texte uniquement (pas audio/image).',
      parameters: {
        type: 'object',
        properties: {
          tenantId: { type: 'string', description: 'ID locataire (cuid)' },
          tenantName: { type: 'string', description: 'Nom à rechercher si pas d’ID' },
          toPhone: {
            type: 'string',
            description: 'Numéro E.164 ou local CG (optionnel — sinon téléphone du locataire en base)',
          },
          subject: { type: 'string', description: 'Libellé / objet interne' },
          body: { type: 'string', description: 'Corps du message WhatsApp' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeSendWhatsAppMedia',
      description:
        'Stub : envoi WhatsApp audio/image non disponible. Retourne unsupported.',
      parameters: {
        type: 'object',
        properties: {
          mediaType: { type: 'string', description: 'audio | image' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rememberMemory',
      description:
        'Mémorise explicitement une préférence / fait / note utilisateur (pas de données métier inventées). ' +
        'scope USER (défaut) ou ORGANIZATION (OWNER uniquement). Ne remplace pas Prisma.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Texte à mémoriser (≤ 2000 car.)' },
          scope: { type: 'string', description: 'USER | ORGANIZATION (défaut USER)' },
          kind: {
            type: 'string',
            description: 'PREFERENCE | FACT | HABIT | DECISION | CONTEXT | NOTE',
          },
          key: { type: 'string', description: 'Clé stable optionnelle (upsert)' },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recallMemories',
      description:
        'Rappelle les mémoires USER de l’utilisateur + ORGANIZATION de l’org. Ne jamais inventer.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filtre texte optionnel (contenu / clé)' },
          scope: { type: 'string', description: 'USER | ORGANIZATION (optionnel)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forgetMemory',
      description: 'Oublie une mémoire par id ou clé (uniquement si autorisé).',
      parameters: {
        type: 'object',
        properties: {
          memoryId: { type: 'string' },
          key: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeOutstandingReminderAutomation',
      description:
        'Détecte les impayés et PROPOSE une automatisation de relances (brouillons). ' +
        'Ne jamais envoyer sans confirmation utilisateur (sauf règle autoExecute OWNER).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeLeaseExpiryReminders',
      description:
        'Détecte les baux ACTIVE bientôt à échéance et propose des rappels (confirmation requise).',
      parameters: {
        type: 'object',
        properties: {
          daysBeforeExpiry: {
            type: 'number',
            description: 'Fenêtre en jours (défaut 30)',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeMaintenanceTasksFromTickets',
      description:
        'Tickets maintenance OPEN/ASSIGNED → propose des StaffTask (confirmation requise).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeAnomalyActions',
      description:
        'Anomalies urgentes analytics → propose actions (navigate / tâche / rappel). Pas de correctif inventé.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listAutomationRuns',
      description: 'Liste les derniers runs d’automatisation IA de l’organisation.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            description:
              'OUTSTANDING_REMINDER | LEASE_EXPIRY_REMINDER | MAINTENANCE_ASSIGN_TASK | ANOMALY_ACTION',
          },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
];

@injectable()
export class AiToolsService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AiContextService) private readonly contextService: AiContextService,
    @inject(AiAnalyticsService) private readonly analytics: AiAnalyticsService,
    @inject(AiDocumentsIntelService) private readonly documentsIntel: AiDocumentsIntelService,
    @inject(TeamMembersService) private readonly teamMembers: TeamMembersService,
    @inject(AiMemoryService) private readonly memory: AiMemoryService,
    @inject(AiAutomationService) private readonly automations: AiAutomationService,
  ) {}

  async execute(
    organizationId: string,
    toolName: string,
    rawArgs: string | Record<string, unknown> | undefined,
    ctx?: AiToolExecuteCtx,
  ): Promise<unknown> {
    const args =
      typeof rawArgs === 'string'
        ? (JSON.parse(rawArgs || '{}') as Record<string, unknown>)
        : { ...(rawArgs ?? {}) };

    // Interdit : org inventée par le LLM / injection prompt — seul organizationId du JWT compte.
    delete args.organizationId;
    delete args.orgId;
    delete args.organization_id;
    delete args.org_id;

    try {
      switch (toolName as AiToolName) {
        case 'getDashboardSummary':
          return await this.getDashboardSummary(organizationId);
        case 'getOutstandingPayments':
          return await this.getOutstandingPayments(organizationId, args);
        case 'getVacantUnits':
          return await this.getVacantUnits(organizationId);
        case 'getUnits':
          return await this.getUnits(organizationId, typeof args.status === 'string' ? args.status : undefined);
        case 'getBuildings':
          return await this.getBuildings(organizationId);
        case 'getContracts':
          return await this.getContracts(organizationId, typeof args.status === 'string' ? args.status : undefined);
        case 'getTenants':
          return await this.getTenants(organizationId);
        case 'getFinancialSummary':
          return await this.getFinancialSummary(organizationId);
        case 'getExpiringContracts':
          return await this.getExpiringContracts(organizationId);
        case 'getTeamMembers':
          return await this.getTeamMembers(organizationId, args);
        case 'analyzePortfolio': {
          const mode = args.mode === 'snapshot' ? 'snapshot' : 'synthesis';
          if (mode === 'snapshot') {
            return await this.analytics.portfolioSnapshot(organizationId);
          }
          return await this.analytics.portfolioSynthesis(organizationId);
        }
        case 'compareRevenue': {
          const now = new Date();
          const defaultA = utcLastMonth(now);
          const defaultB = utcThisMonth(now);
          const periodA = {
            month:
              typeof args.periodAMonth === 'number' && args.periodAMonth >= 1 && args.periodAMonth <= 12
                ? Math.floor(args.periodAMonth)
                : defaultA.month,
            year:
              typeof args.periodAYear === 'number' && args.periodAYear >= 2000
                ? Math.floor(args.periodAYear)
                : defaultA.year,
          };
          const periodB = {
            month:
              typeof args.periodBMonth === 'number' && args.periodBMonth >= 1 && args.periodBMonth <= 12
                ? Math.floor(args.periodBMonth)
                : defaultB.month,
            year:
              typeof args.periodBYear === 'number' && args.periodBYear >= 2000
                ? Math.floor(args.periodBYear)
                : defaultB.year,
          };
          return await this.analytics.compareRevenuePeriods(organizationId, periodA, periodB);
        }
        case 'rankBuildingsByOutstanding': {
          const limit =
            typeof args.limit === 'number' && Number.isFinite(args.limit)
              ? Math.max(1, Math.min(20, Math.floor(args.limit)))
              : 5;
          return await this.analytics.buildingsOutstandingRanking(organizationId, limit);
        }
        case 'explainRevenueChange':
          return await this.analytics.revenueDropExplanation(organizationId);
        case 'listUrgentIssues': {
          const limit =
            typeof args.limit === 'number' && Number.isFinite(args.limit)
              ? Math.max(1, Math.min(20, Math.floor(args.limit)))
              : 5;
          return await this.analytics.topUrgentIssues(organizationId, limit);
        }
        case 'listDocumentsForAi':
          return await this.documentsIntel.listAnalyzableDocuments(organizationId);
        case 'summarizeDocument':
          return await this.documentsIntel.summarizeDocument(organizationId, {
            documentId: typeof args.documentId === 'string' ? args.documentId : undefined,
            leaseId: typeof args.leaseId === 'string' ? args.leaseId : undefined,
            paymentId: typeof args.paymentId === 'string' ? args.paymentId : undefined,
            kind: typeof args.kind === 'string' ? args.kind : undefined,
          });
        case 'extractDocumentFacts':
          return await this.documentsIntel.extractDocumentFacts(organizationId, {
            documentId: typeof args.documentId === 'string' ? args.documentId : undefined,
            leaseId: typeof args.leaseId === 'string' ? args.leaseId : undefined,
            paymentId: typeof args.paymentId === 'string' ? args.paymentId : undefined,
            kind: typeof args.kind === 'string' ? args.kind : undefined,
          });
        case 'askAboutDocument':
          return await this.documentsIntel.answerDocumentQuestion(
            organizationId,
            typeof args.question === 'string' ? args.question : '',
            {
              documentId: typeof args.documentId === 'string' ? args.documentId : undefined,
              leaseId: typeof args.leaseId === 'string' ? args.leaseId : undefined,
              paymentId: typeof args.paymentId === 'string' ? args.paymentId : undefined,
              kind: typeof args.kind === 'string' ? args.kind : undefined,
            },
          );
        case 'checkLeaseDocumentConsistency': {
          let leaseId =
            typeof args.leaseId === 'string' && args.leaseId.trim()
              ? args.leaseId.trim()
              : undefined;
          if (!leaseId) {
            const recent = await this.prisma.lease.findFirst({
              where: { organizationId },
              orderBy: { updatedAt: 'desc' },
              select: { id: true },
            });
            leaseId = recent?.id;
          }
          if (!leaseId) {
            return {
              found: false,
              error: 'Aucun bail dans votre organisation pour vérifier les incohérences.',
            };
          }
          return await this.documentsIntel.detectInconsistencies(organizationId, leaseId);
        }
        case 'compareDocuments':
          return await this.documentsIntel.compareDocuments(organizationId, {
            leaseIdA: typeof args.leaseIdA === 'string' ? args.leaseIdA : undefined,
            leaseIdB: typeof args.leaseIdB === 'string' ? args.leaseIdB : undefined,
          });
        case 'proposeGenerateLeasePdf':
          return await this.listLeasesForPdf(organizationId, typeof args.leaseId === 'string' ? args.leaseId : undefined);
        case 'proposeGeneratePaymentReceipt':
          return await this.listPaymentsForReceipt(
            organizationId,
            typeof args.paymentId === 'string' ? args.paymentId : undefined,
          );
        case 'proposeGeneratePaymentNotice':
          return await this.listPaymentsForNotice(
            organizationId,
            typeof args.paymentId === 'string' ? args.paymentId : undefined,
          );
        case 'proposeCreateLease':
          return await this.proposeCreateLease(organizationId, args);
        case 'proposeSendTenantMessage':
          return await this.proposeSendTenantMessage(organizationId, args);
        case 'proposeSendWhatsAppMessage':
          return await this.proposeSendWhatsAppMessage(organizationId, args);
        case 'proposeSendWhatsAppMedia':
          return {
            ready: false,
            unsupported: true,
            error:
              'Envoi WhatsApp audio/image non encore disponible. Utilisez un message texte (proposeSendWhatsAppMessage).',
          };
        case 'rememberMemory':
          return await this.rememberMemory(organizationId, args, ctx);
        case 'recallMemories':
          return await this.recallMemories(organizationId, args, ctx);
        case 'forgetMemory':
          return await this.forgetMemory(organizationId, args, ctx);
        case 'proposeOutstandingReminderAutomation':
          return await this.proposeAutomationKind(
            organizationId,
            AiAutomationKind.OUTSTANDING_REMINDER,
            ctx,
          );
        case 'proposeLeaseExpiryReminders': {
          const days =
            typeof args.daysBeforeExpiry === 'number' && Number.isFinite(args.daysBeforeExpiry)
              ? Math.max(1, Math.min(365, Math.floor(args.daysBeforeExpiry)))
              : 30;
          return await this.proposeAutomationKind(
            organizationId,
            AiAutomationKind.LEASE_EXPIRY_REMINDER,
            ctx,
            { daysBeforeExpiry: days },
          );
        }
        case 'proposeMaintenanceTasksFromTickets':
          return await this.proposeAutomationKind(
            organizationId,
            AiAutomationKind.MAINTENANCE_ASSIGN_TASK,
            ctx,
          );
        case 'proposeAnomalyActions':
          return await this.proposeAutomationKind(
            organizationId,
            AiAutomationKind.ANOMALY_ACTION,
            ctx,
          );
        case 'listAutomationRuns': {
          const user = this.requireToolUser(ctx);
          const kindRaw = typeof args.kind === 'string' ? args.kind.trim() : undefined;
          const kind =
            kindRaw && Object.values(AiAutomationKind).includes(kindRaw as AiAutomationKind)
              ? (kindRaw as AiAutomationKind)
              : undefined;
          const limit =
            typeof args.limit === 'number' && Number.isFinite(args.limit)
              ? Math.max(1, Math.min(50, Math.floor(args.limit)))
              : 20;
          const runs = await this.automations.listRuns(organizationId, { kind, limit });
          return {
            count: runs.length,
            items: runs.map((r) => ({
              id: r.id,
              kind: r.kind,
              status: r.status,
              idempotencyKey: r.idempotencyKey,
              createdAt: r.createdAt.toISOString(),
              executedAt: r.executedAt?.toISOString() ?? null,
            })),
          };
        }
        default:
          return { error: `Outil inconnu: ${toolName}`, code: 404 };
      }
    } catch (err) {
      return mapToolError(err);
    }
  }

  private requireToolUser(ctx?: AiToolExecuteCtx): AiToolExecuteCtx {
    if (!ctx?.userId || !ctx.role) {
      throw new ForbiddenError('Contexte utilisateur requis pour la mémoire IA');
    }
    return ctx;
  }

  private async proposeAutomationKind(
    organizationId: string,
    kind: AiAutomationKind,
    ctx?: AiToolExecuteCtx,
    config?: { daysBeforeExpiry?: number; maxItems?: number; channel?: 'IN_APP' | 'WHATSAPP' },
  ) {
    const user = this.requireToolUser(ctx);
    const result = await this.automations.detectAndPropose({
      organizationId,
      userId: user.userId,
      role: user.role,
      kind,
      config,
    });
    return {
      kind,
      runId: result.run?.id ?? null,
      status: result.run?.status ?? (result.itemCount === 0 ? 'EMPTY' : null),
      itemCount: result.itemCount,
      summary: result.summary,
      duplicate: result.duplicate,
      skippedDuplicate: result.skippedDuplicate,
      autoExecuted: result.autoExecuted,
      requiresConfirmation: !!result.pendingAction && !result.autoExecuted,
      pendingActionId: result.pendingAction?.id ?? null,
      pendingAction: result.pendingAction
        ? {
            id: result.pendingAction.id,
            type: result.pendingAction.type,
            title: 'Approuver l’automatisation',
            summary: result.pendingAction.payload.summary ?? result.summary,
            payload: result.pendingAction.payload,
          }
        : null,
    };
  }

  private async rememberMemory(
    organizationId: string,
    args: Record<string, unknown>,
    ctx?: AiToolExecuteCtx,
  ) {
    if (!isAiMemoryEnabled) return { enabled: false, error: 'Mémoire IA désactivée' };
    const user = this.requireToolUser(ctx);
    const content = typeof args.content === 'string' ? args.content : '';
    const scopeRaw = typeof args.scope === 'string' ? args.scope : 'USER';
    const kind = typeof args.kind === 'string' ? args.kind : undefined;
    const key = typeof args.key === 'string' ? args.key : undefined;
    const entry = await this.memory.remember({
      organizationId,
      userId: user.userId,
      role: user.role,
      scope: scopeRaw.toUpperCase() === 'ORGANIZATION' ? AiMemoryScope.ORGANIZATION : AiMemoryScope.USER,
      kind: kind as AiMemoryKind | undefined,
      key,
      content,
    });
    return {
      enabled: true,
      remembered: true,
      id: entry.id,
      scope: entry.scope,
      kind: entry.kind,
      key: entry.key,
      content: entry.content,
    };
  }

  private async recallMemories(
    organizationId: string,
    args: Record<string, unknown>,
    ctx?: AiToolExecuteCtx,
  ) {
    if (!isAiMemoryEnabled) return { enabled: false, error: 'Mémoire IA désactivée' };
    const user = this.requireToolUser(ctx);
    const query = typeof args.query === 'string' ? args.query : undefined;
    const scope = typeof args.scope === 'string' ? args.scope : undefined;
    const items = await this.memory.recall({
      organizationId,
      userId: user.userId,
      role: user.role,
      query,
      scope: scope as AiMemoryScope | undefined,
      limit: 20,
    });
    return { enabled: true, count: items.length, items };
  }

  private async forgetMemory(
    organizationId: string,
    args: Record<string, unknown>,
    ctx?: AiToolExecuteCtx,
  ) {
    if (!isAiMemoryEnabled) return { enabled: false, error: 'Mémoire IA désactivée' };
    const user = this.requireToolUser(ctx);
    const memoryId = typeof args.memoryId === 'string' ? args.memoryId : undefined;
    const key = typeof args.key === 'string' ? args.key : undefined;
    const result = await this.memory.forget({
      organizationId,
      userId: user.userId,
      role: user.role,
      memoryId,
      key,
    });
    return { enabled: true, ...result };
  }

  /** Intent routing sans LLM — données réelles uniquement. Session = enrichissement référentiel. */
  resolveLocalToolIntents(
    message: string,
    session?: AiSessionEntities,
    history?: ChatHistoryTurn[],
  ): LocalToolIntent[] {
    const q = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    const tools: LocalToolIntent[] = [];
    const isHowto = q.includes('comment') || q.includes('comment faire') || q.includes('ou aller');
    const ref = detectReferentialIntent(message);

    // Annulation / pourquoi : gérés dans AiService (pas d’intent outil ici si purs).
    if (ref.wantsCancelLast && tools.length === 0) {
      return [];
    }

    // ── Phase H automations (avant Phase F / listes — priorité « automatis ») ──
    const wantsAutomationKeyword =
      q.includes('automatis') || (q.includes('lance') && q.includes('automat'));
    const wantsOutstandingAutomation =
      wantsAutomationKeyword &&
      (q.includes('relanc') || q.includes('impay') || q.includes('impaye'));
    const wantsLeaseExpiryAutomation =
      (q.includes('rappel') && (q.includes('echeanc') || q.includes('expir'))) ||
      (q.includes('baux') && q.includes('expir')) ||
      ((q.includes('bail') || q.includes('baux')) &&
        q.includes('expir') &&
        (q.includes('rappel') || wantsAutomationKeyword));
    const wantsMaintTaskAutomation =
      (q.includes('tache') || q.includes('taches')) &&
      (q.includes('ticket') || q.includes('maintenance'));
    const wantsAnomalyAutomation =
      q.includes('anomal') &&
      (wantsAutomationKeyword || q.includes('propose') || q.includes('action'));

    if (wantsOutstandingAutomation) {
      tools.push({ name: 'proposeOutstandingReminderAutomation' });
    }
    if (wantsLeaseExpiryAutomation) {
      tools.push({ name: 'proposeLeaseExpiryReminders' });
    }
    if (wantsMaintTaskAutomation) {
      tools.push({ name: 'proposeMaintenanceTasksFromTickets' });
    }
    if (wantsAnomalyAutomation) {
      tools.push({ name: 'proposeAnomalyActions' });
    }
    if (
      q.includes('automatisation') &&
      (q.includes('liste') || q.includes('historique') || q.includes('runs'))
    ) {
      tools.push({ name: 'listAutomationRuns' });
    }

    // ── Phase F analytics (avant listes génériques pour éviter le vol d’intent) ──
    const wantsBuildingOutstandingRank =
      q.includes('immeuble') &&
      q.includes('quel') &&
      (q.includes('impay') || q.includes('retard'));
    const wantsCompareRevenue =
      q.includes('compar') &&
      (q.includes('revenu') || q.includes('encaiss') || q.includes('mois'));
    const wantsExplainRevenue =
      q.includes('pourquoi') &&
      (q.includes('revenu') || q.includes('baisse') || q.includes('encaiss'));
    const wantsPortfolioAnalysis =
      (q.includes('resume') &&
        (q.includes('parc') || q.includes('situation') || q.includes('patrimoine'))) ||
      (q.includes('synthese') &&
        (q.includes('parc') || q.includes('situation') || q.includes('patrimoine'))) ||
      (q.includes('analyse') &&
        (q.includes('parc') || q.includes('situation') || q.includes('patrimoine'))) ||
      (q.includes('situation') && q.includes('parc')) ||
      q.includes('situation de mon parc');
    const wantsUrgentIssues =
      /\b(5|cinq)?\s*problemes?\s*urgents?\b/.test(q) ||
      q.includes('plus urgents') ||
      (q.includes('problemes') && q.includes('urgent')) ||
      (q.includes('probleme') && q.includes('urgent'));

    if (wantsBuildingOutstandingRank) {
      tools.push({ name: 'rankBuildingsByOutstanding' });
    }
    if (wantsCompareRevenue) {
      tools.push({ name: 'compareRevenue' });
    }
    if (wantsExplainRevenue) {
      tools.push({ name: 'explainRevenueChange' });
    }
    if (wantsPortfolioAnalysis) {
      tools.push({ name: 'analyzePortfolio' });
    }
    if (wantsUrgentIssues) {
      tools.push({ name: 'listUrgentIssues' });
    }

    // ── Phase G document intel (avant résumé dashboard / getContracts) ──
    const wantsDocCompare =
      q.includes('compar') && (q.includes('contrat') || q.includes('document') || q.includes('bail'));
    const wantsDocInconsistency =
      q.includes('incoher') ||
      q.includes('incoherent') ||
      q.includes('coherenc') ||
      (q.includes('verifie') && (q.includes('contrat') || q.includes('bail') || q.includes('document')));
    const wantsDocExtract =
      (q.includes('extrait') ||
        q.includes('extraire') ||
        q.includes('extrais') ||
        q.includes('extraction') ||
        q.includes('extractdocumentfacts')) &&
      (q.includes('document') ||
        q.includes('contrat') ||
        q.includes('pdf') ||
        q.includes('recu') ||
        q.includes('bail'));
    const wantsDocSummarize =
      (q.includes('resume') || q.includes('resumer') || q.includes('synthese') || q.includes('synthetis')) &&
      (q.includes('contrat') ||
        q.includes('document') ||
        q.includes('pdf') ||
        q.includes('recu') ||
        q.includes('quittance') ||
        (q.includes('avis') && q.includes('paiement')));
    const wantsDocQa =
      q.includes('dans le contrat') ||
      q.includes('dans mon contrat') ||
      q.includes('sur le recu') ||
      q.includes('sur mon recu') ||
      q.includes('dans le document') ||
      q.includes('sur le document') ||
      q.includes('dans le pdf') ||
      q.includes('sur le pdf') ||
      q.includes('dans le bail') ||
      q.includes('sur le bail') ||
      ((q.includes('loyer') ||
        q.includes('montant') ||
        q.includes('duree') ||
        q.includes('echeance') ||
        q.includes('depot') ||
        q.includes('caution') ||
        q.includes('resiliation') ||
        q.includes('preavis')) &&
        (q.includes('contrat') || q.includes('bail') || q.includes('pdf') || q.includes('document')));
    const wantsListDocs =
      (q.includes('documents') &&
        (q.includes('liste') ||
          q.includes('mes ') ||
          q.includes('analys') ||
          q.includes('disponib') ||
          q.includes('montre'))) ||
      q.includes('documents analysables') ||
      q.includes('quels documents') ||
      q.includes('liste des documents');

    const docRefArgs = extractDocumentRefArgsFromMessage(message, q);

    if (wantsDocCompare) {
      tools.push({ name: 'compareDocuments', args: docRefArgs });
    } else if (wantsDocInconsistency) {
      tools.push({
        name: 'checkLeaseDocumentConsistency',
        args: docRefArgs.leaseId ? { leaseId: docRefArgs.leaseId } : docRefArgs,
      });
    } else if (wantsDocExtract) {
      tools.push({ name: 'extractDocumentFacts', args: docRefArgs });
    } else if (wantsDocQa) {
      tools.push({
        name: 'askAboutDocument',
        args: { question: message.trim(), ...docRefArgs },
      });
    } else if (wantsDocSummarize) {
      tools.push({ name: 'summarizeDocument', args: docRefArgs });
    } else if (wantsListDocs) {
      tools.push({ name: 'listDocumentsForAi' });
    }

    if (
      !wantsBuildingOutstandingRank &&
      !wantsDocInconsistency &&
      !wantsOutstandingAutomation &&
      (q.includes('impay') ||
        q.includes('retard') ||
        q.includes('relanc') ||
        (q.includes('pas pay') && (q.includes('qui') || q.includes('locataire') || q.includes('encore'))) ||
        (q.includes('pas') && q.includes('pay') && (q.includes('encore') || q.includes('locataire') || q.includes('qui'))) ||
        (q.includes('doivent') && q.includes('payer')) ||
        (q.includes('montant') && (q.includes('impay') || q.includes('du'))))
    ) {
      tools.push({ name: 'getOutstandingPayments' });
    }

    const wantsVacant =
      q.includes('vacant') ||
      ((q.includes('libre') || q.includes('disponib')) &&
        (q.includes('logement') || q.includes('appart') || q.includes('bien') || q.includes('unit')));
    if (wantsVacant) {
      tools.push({ name: 'getVacantUnits' });
    }

    const wantsPropertyTypesCatalog =
      /\btypes?\s+de\s+(biens?|logements?|appartements?)\b/.test(q);
    const wantsUnits =
      !isHowto &&
      !wantsVacant &&
      !wantsPropertyTypesCatalog &&
      (q.includes('logement') ||
        q.includes('appartement') ||
        /\bappart\b/.test(q) ||
        /\bmes biens\b/.test(q) ||
        (/\bcombien\b.*\b(logement|appart|biens?)\b/.test(q) && !/\btypes?\b/.test(q)) ||
        /\b(logement|appart|biens?).*\bcombien\b/.test(q) ||
        (q.includes('montre') && (q.includes('patrimoine') || q.includes('parc'))) ||
        q.includes('liste des biens') ||
        q.includes('liste des logements'));
    if (wantsUnits) {
      tools.push({ name: 'getUnits' });
    }

    if (
      !isHowto &&
      !wantsBuildingOutstandingRank &&
      (q.includes('immeuble') || q.includes('residence') || q.includes('résidence')) &&
      !q.includes('plus') &&
      !q.includes('genere')
    ) {
      tools.push({ name: 'getBuildings' });
    }

    if (
      !wantsLeaseExpiryAutomation &&
      (q.includes('expir') || q.includes('echeanc') || (q.includes('bientot') && q.includes('loyer')))
    ) {
      tools.push({ name: 'getExpiringContracts' });
    }

    const mentionsPdfDoc =
      q.includes('pdf') && !q.includes('sans pdf') && !q.includes('pas de pdf') && !q.includes('sans le pdf');
    const wantsLeasePdf =
      (q.includes('contrat') || q.includes('bail')) &&
      (q.includes('gener') || mentionsPdfDoc || q.includes('prepar'));
    const wantsCreateLease =
      (q.includes('contrat') || q.includes('bail')) &&
      (q.includes('cree') || q.includes('creer') || q.includes('nouveau') || q.includes('ouvrir')) &&
      !q.includes('gener') &&
      (!q.includes('pdf') || q.includes('sans pdf') || q.includes('pas de pdf') || q.includes('sans le pdf'));

    if (wantsCreateLease) {
      tools.push({ name: 'proposeCreateLease', args: extractCreateLeaseArgsFromMessage(message) });
    } else if (wantsLeasePdf) {
      tools.push({ name: 'proposeGenerateLeasePdf' });
    } else if (
      (q.includes('contrat') || q.includes('bail')) &&
      !wantsDocCompare &&
      !wantsDocInconsistency &&
      !wantsDocExtract &&
      !wantsDocQa &&
      !wantsDocSummarize &&
      !wantsListDocs
    ) {
      tools.push({ name: 'getContracts' });
    }
    if (
      (q.includes('recu') || q.includes('quittance')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar') || q.includes('fais'))
    ) {
      tools.push({ name: 'proposeGeneratePaymentReceipt' });
    }
    const wantsPdfNotice =
      !(q.includes('whatsapp') || q.includes('whats app')) &&
      (q.includes('avis de paiement') ||
        (q.includes('avis') && q.includes('loyer')) ||
        (q.includes('rappel de loyer') &&
          (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar') || q.includes('fais')))) &&
      (q.includes('gener') ||
        q.includes('cree') ||
        q.includes('pdf') ||
        q.includes('prepar') ||
        q.includes('envoie') ||
        q.includes('fais'));
    if (wantsPdfNotice) {
      tools.push({ name: 'proposeGeneratePaymentNotice' });
    }

    const wantsWhatsAppMedia =
      (q.includes('whatsapp') || q.includes('whats app')) &&
      (q.includes('audio') ||
        q.includes('vocal') ||
        q.includes('voix') ||
        q.includes('image') ||
        q.includes('photo') ||
        q.includes('media') ||
        q.includes('média'));
    const wantsRentReminderSend =
      (q.includes('envoie') || q.includes('envoyer')) &&
      q.includes('rappel') &&
      (q.includes('loyer') || q.includes('locataire'));
    const wantsWhatsAppExplicit = q.includes('whatsapp') || q.includes('whats app');
    const wantsWhatsAppMessage =
      !wantsWhatsAppMedia &&
      !wantsPdfNotice &&
      (wantsWhatsAppExplicit || (isWhatsAppConfigured && wantsRentReminderSend));

    if (wantsWhatsAppMedia) {
      tools.push({ name: 'proposeSendWhatsAppMedia' });
    } else if (wantsWhatsAppMessage) {
      tools.push({
        name: 'proposeSendWhatsAppMessage',
        args: extractSendWhatsAppMessageArgsFromMessage(message),
      });
    }

    const wantsTenantMessage =
      !wantsPdfNotice &&
      !wantsWhatsAppMessage &&
      !wantsWhatsAppMedia &&
      ((q.includes('message') &&
        (q.includes('envoie') ||
          q.includes('envoyer') ||
          q.includes('ecrire') ||
          q.includes('ecris') ||
          q.includes('locataire'))) ||
        (q.includes('envoie') && q.includes('rappel') && !q.includes('avis') && !q.includes('loyer')) ||
        (q.includes('envoyer') && q.includes('rappel') && !q.includes('avis') && !q.includes('loyer')) ||
        (!isWhatsAppConfigured && wantsRentReminderSend));
    if (wantsTenantMessage) {
      tools.push({ name: 'proposeSendTenantMessage', args: extractSendTenantMessageArgsFromMessage(message) });
    }
    if (
      q.includes('locataire') &&
      !q.includes('retirer') &&
      !q.includes('ajout') &&
      !q.includes('comment') &&
      !q.includes('creer') &&
      !q.includes('cree') &&
      !q.includes('pas encore pay') &&
      !q.includes('doivent')
    ) {
      tools.push({ name: 'getTenants' });
    }
    if (
      !wantsCompareRevenue &&
      !wantsExplainRevenue &&
      (q.includes('revenu') ||
        q.includes('financ') ||
        q.includes('encaiss') ||
        (/\bpaiements?\b/.test(q) &&
          !q.includes('avis') &&
          !q.includes('recu') &&
          !q.includes('quittance') &&
          !q.includes('gener') &&
          !q.includes('cree') &&
          !q.includes('creer')))
    ) {
      tools.push({ name: 'getFinancialSummary' });
    }
    if (
      !wantsPortfolioAnalysis &&
      !wantsDocSummarize &&
      !wantsDocQa &&
      !wantsDocExtract &&
      (q.includes('resume') ||
        q.includes('situation') ||
        q.includes('dashboard') ||
        (q.includes('patrimoine') && !wantsUnits) ||
        (q.includes('parc') && !wantsUnits && !q.includes('logement')))
    ) {
      tools.push({ name: 'getDashboardSummary' });
    }

    const teamIntent = resolveTeamMembersLocalIntent(q);
    if (teamIntent) tools.push(teamIntent);

    const memoryIntent = resolveMemoryLocalIntent(message, q);
    if (memoryIntent) tools.push(memoryIntent);

    const seen = new Set<string>();
    const deduped = tools.filter((t) => {
      const key = `${t.name}:${JSON.stringify(t.args ?? {})}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Phase D : enrichissement session / historique (référents, période, fais pareil).
    const enriched = enrichLocalIntents({
      message,
      intents: deduped,
      session,
      history,
    });

    // Clarification seule : pas d’outil inventé
    if (enriched.needsClarification && enriched.intents.length === 0) {
      return [];
    }

    const seen2 = new Set<string>();
    return enriched.intents
      .filter((t) => {
        const key = `${t.name}:${JSON.stringify(t.args ?? {})}`;
        if (seen2.has(key)) return false;
        seen2.add(key);
        return true;
      })
      .map((t) => ({ name: t.name as AiToolName, args: t.args }));
  }

  /**
   * Clarification référentielle (appelant) — si message pronominal sans session.
   */
  resolveReferentialClarification(
    message: string,
    session?: AiSessionEntities,
    history?: ChatHistoryTurn[],
  ): string | undefined {
    const enriched = enrichLocalIntents({
      message,
      intents: [],
      session,
      history,
    });
    return enriched.needsClarification;
  }

  private async getTeamMembers(organizationId: string, args: Record<string, unknown>) {
    const role = typeof args.role === 'string' ? args.role.trim() : undefined;
    const statusRaw = typeof args.status === 'string' ? args.status.trim().toLowerCase() : undefined;
    const status =
      statusRaw === 'active' || statusRaw === 'inactive' || statusRaw === 'all' ? statusRaw : undefined;
    const search = typeof args.search === 'string' ? args.search : undefined;

    const items = await this.teamMembers.listOrganizationMembers(organizationId, {
      role,
      status,
      search,
    });

    return {
      count: items.length,
      filter: {
        role: role ? normalizeRole(role) : null,
        status: status ?? 'all',
        search: search?.trim() || null,
      },
      organizationId,
      items: items.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone,
        role: m.role,
        roleLabel: m.roleLabel,
        isActive: m.isActive,
        openAssignedTickets: m.openAssignedTickets,
      })),
    };
  }

  private async getDashboardSummary(organizationId: string) {
    const ctx = await this.contextService.buildContext(organizationId);
    return { organization: ctx.organization, summary: ctx.summary };
  }

  private async getOutstandingPayments(organizationId: string, args: Record<string, unknown> = {}) {
    const periodRaw = typeof args.period === 'string' ? args.period.trim() : undefined;
    const period =
      periodRaw === 'last_month' || periodRaw === 'this_month' ? periodRaw : undefined;
    const tenantId = typeof args.tenantId === 'string' && args.tenantId.trim() ? args.tenantId.trim() : undefined;

    const now = new Date();
    let periodMonth: number | undefined;
    let periodYear: number | undefined;
    if (period === 'this_month') {
      periodMonth = now.getUTCMonth() + 1;
      periodYear = now.getUTCFullYear();
    } else if (period === 'last_month') {
      const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      periodMonth = last.getUTCMonth() + 1;
      periodYear = last.getUTCFullYear();
    }

    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
        ...(periodMonth != null && periodYear != null
          ? { periodMonth, periodYear }
          : {}),
        ...(tenantId ? { lease: { tenantId } } : {}),
      },
      take: 40,
      orderBy: { dueDate: 'asc' },
      include: {
        lease: { include: { tenant: true, apartment: true } },
      },
    });
    const items = rows.map((p) => {
      const amount = decimalToNumber(p.amount);
      const paid = decimalToNumber(p.amountPaid);
      const remaining = Math.max(0, amount - paid);
      return {
        id: p.id,
        status: p.status,
        amountXaf: amount,
        amountPaidXaf: paid,
        remainingXaf: remaining,
        dueDate: p.dueDate.toISOString().slice(0, 10),
        period: `${p.periodMonth}/${p.periodYear}`,
        tenantId: p.lease.tenantId,
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
      };
    });
    const totalRemainingXaf = items.reduce((sum, p) => sum + p.remainingXaf, 0);
    return {
      count: items.length,
      totalRemainingXaf,
      filter: {
        period: period ?? null,
        periodMonth: periodMonth ?? null,
        periodYear: periodYear ?? null,
        tenantId: tenantId ?? null,
      },
      items,
    };
  }

  private async getVacantUnits(organizationId: string) {
    const rows = await this.prisma.apartment.findMany({
      where: { organizationId, status: ApartmentStatus.AVAILABLE },
      take: 30,
      select: {
        id: true,
        label: true,
        rentAmount: true,
        building: { select: { id: true, name: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((a) => ({
        id: a.id,
        label: a.label,
        rentXaf: decimalToNumber(a.rentAmount),
        buildingId: a.building?.id,
        buildingName: a.building?.name,
      })),
    };
  }

  private async getUnits(organizationId: string, status?: string) {
    const whereStatus =
      status && Object.values(ApartmentStatus).includes(status as ApartmentStatus)
        ? { status: status as ApartmentStatus }
        : {};

    const rows = await this.prisma.apartment.findMany({
      where: { organizationId, ...whereStatus },
      take: 60,
      orderBy: [{ building: { name: 'asc' } }, { label: 'asc' }],
      select: {
        id: true,
        label: true,
        status: true,
        rentAmount: true,
        building: { select: { id: true, name: true } },
      },
    });

    const byBuilding = new Map<
      string,
      { buildingId: string | null; buildingName: string; units: Array<Record<string, unknown>> }
    >();
    for (const a of rows) {
      const key = a.building?.id ?? '_none';
      if (!byBuilding.has(key)) {
        byBuilding.set(key, {
          buildingId: a.building?.id ?? null,
          buildingName: a.building?.name ?? 'Sans immeuble',
          units: [],
        });
      }
      byBuilding.get(key)!.units.push({
        id: a.id,
        label: a.label,
        status: a.status,
        rentXaf: decimalToNumber(a.rentAmount),
      });
    }

    const occupied = rows.filter((a) => a.status === ApartmentStatus.OCCUPIED).length;
    const vacant = rows.filter((a) => a.status === ApartmentStatus.AVAILABLE).length;
    const maintenance = rows.filter((a) => a.status === ApartmentStatus.MAINTENANCE).length;

    return {
      count: rows.length,
      occupied,
      vacant,
      maintenance,
      buildings: [...byBuilding.values()],
      items: rows.map((a) => ({
        id: a.id,
        label: a.label,
        status: a.status,
        rentXaf: decimalToNumber(a.rentAmount),
        buildingId: a.building?.id,
        buildingName: a.building?.name,
      })),
    };
  }

  private async getBuildings(organizationId: string) {
    const rows = await this.prisma.building.findMany({
      where: { organizationId },
      take: 40,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        _count: { select: { apartments: true } },
        apartments: {
          select: { status: true },
        },
      },
    });
    return {
      count: rows.length,
      items: rows.map((b) => {
        const occupied = b.apartments.filter((a) => a.status === ApartmentStatus.OCCUPIED).length;
        const vacant = b.apartments.filter((a) => a.status === ApartmentStatus.AVAILABLE).length;
        return {
          id: b.id,
          name: b.name,
          city: b.city,
          address: b.address,
          apartmentsTotal: b._count.apartments,
          occupied,
          vacant,
        };
      }),
    };
  }

  private async getContracts(organizationId: string, status?: string) {
    const whereStatus =
      status && Object.values(LeaseStatus).includes(status as LeaseStatus)
        ? { status: status as LeaseStatus }
        : { status: { in: [LeaseStatus.ACTIVE, LeaseStatus.DRAFT, LeaseStatus.EXPIRED] } };

    const rows = await this.prisma.lease.findMany({
      where: { organizationId, ...whereStatus },
      take: 20,
      orderBy: { updatedAt: 'desc' },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        apartment: { select: { id: true, label: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((l) => ({
        id: l.id,
        status: l.status,
        monthlyRentXaf: decimalToNumber(l.monthlyRent),
        startDate: l.startDate.toISOString().slice(0, 10),
        endDate: l.endDate.toISOString().slice(0, 10),
        tenantName: `${l.tenant.firstName} ${l.tenant.lastName}`,
        tenantId: l.tenant.id,
        apartmentLabel: l.apartment.label,
        apartmentId: l.apartment.id,
        hasPdf: Boolean(l.contractPdfUrl),
      })),
    };
  }

  private async getTenants(organizationId: string) {
    const rows = await this.prisma.tenant.findMany({
      where: { organizationId },
      take: 40,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        _count: { select: { leases: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((t) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        phone: t.phone,
        email: t.email,
        leasesCount: t._count.leases,
      })),
    };
  }

  private async getFinancialSummary(organizationId: string) {
    const ctx = await this.contextService.buildContext(organizationId);
    const s = ctx.summary;
    return {
      collectedThisMonthXaf: s.collectedThisMonthXaf,
      potentialMonthlyRentXaf: s.potentialMonthlyRentXaf,
      latePayments: s.latePayments,
      pendingPayments: s.pendingPayments,
      occupancyRate: s.occupancyRate,
    };
  }

  private async getExpiringContracts(organizationId: string) {
    const ctx = await this.contextService.buildContext(organizationId);
    return { count: ctx.expiringLeases.length, items: ctx.expiringLeases };
  }

  private async listLeasesForPdf(organizationId: string, leaseId?: string) {
    if (leaseId) {
      const lease = await this.prisma.lease.findFirst({
        where: { id: leaseId, organizationId },
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          apartment: { select: { label: true } },
        },
      });
      if (!lease) return { found: false, leaseId };
      return {
        found: true,
        lease: {
          id: lease.id,
          status: lease.status,
          tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
          apartmentLabel: lease.apartment.label,
          monthlyRentXaf: decimalToNumber(lease.monthlyRent),
        },
        requiresUserConfirmation: true,
      };
    }
    const listed = await this.getContracts(organizationId);
    return { ...listed, requiresUserConfirmation: true };
  }

  private async listPaymentsForReceipt(organizationId: string, paymentId?: string) {
    if (paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId,
          status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] },
        },
        include: {
          lease: {
            include: {
              tenant: { select: { firstName: true, lastName: true } },
              apartment: { select: { label: true } },
            },
          },
        },
      });
      if (!payment) {
        return { found: false, paymentId, requiresUserConfirmation: true };
      }
      return {
        found: true,
        payment: {
          id: payment.id,
          status: payment.status,
          amountPaidXaf: decimalToNumber(payment.amountPaid),
          period: `${payment.periodMonth}/${payment.periodYear}`,
          tenantName: `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`,
          apartmentLabel: payment.lease.apartment.label,
          hasReceipt: Boolean(payment.receiptPdfUrl),
        },
        requiresUserConfirmation: true,
      };
    }

    const rows = await this.prisma.payment.findMany({
      where: { organizationId, status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] } },
      take: 15,
      orderBy: [{ paidAt: 'desc' }, { updatedAt: 'desc' }],
      include: {
        lease: {
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            apartment: { select: { label: true } },
          },
        },
      },
    });
    return {
      count: rows.length,
      items: rows.map((p) => ({
        id: p.id,
        status: p.status,
        amountPaidXaf: decimalToNumber(p.amountPaid),
        period: `${p.periodMonth}/${p.periodYear}`,
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
        hasReceipt: Boolean(p.receiptPdfUrl),
      })),
      requiresUserConfirmation: true,
    };
  }

  private async listPaymentsForNotice(organizationId: string, paymentId?: string) {
    if (paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.LATE, PaymentStatus.PARTIAL] },
        },
        include: {
          lease: {
            include: {
              tenant: { select: { firstName: true, lastName: true } },
              apartment: { select: { label: true } },
            },
          },
        },
      });
      if (!payment) {
        return { found: false, paymentId, requiresUserConfirmation: true };
      }
      const due = Math.max(0, decimalToNumber(payment.amount) - decimalToNumber(payment.amountPaid));
      return {
        found: true,
        payment: {
          id: payment.id,
          status: payment.status,
          amountDueXaf: due,
          period: `${payment.periodMonth}/${payment.periodYear}`,
          dueDate: payment.dueDate.toISOString().slice(0, 10),
          tenantName: `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`,
          apartmentLabel: payment.lease.apartment.label,
        },
        requiresUserConfirmation: true,
      };
    }

    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.LATE, PaymentStatus.PARTIAL] },
      },
      take: 15,
      orderBy: { dueDate: 'asc' },
      include: {
        lease: {
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            apartment: { select: { label: true } },
          },
        },
      },
    });
    return {
      count: rows.length,
      items: rows.map((p) => ({
        id: p.id,
        status: p.status,
        amountDueXaf: Math.max(0, decimalToNumber(p.amount) - decimalToNumber(p.amountPaid)),
        period: `${p.periodMonth}/${p.periodYear}`,
        dueDate: p.dueDate.toISOString().slice(0, 10),
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
      })),
      requiresUserConfirmation: true,
    };
  }

  /** Valide une proposition de création de bail — ne mute pas. */
  private async proposeCreateLease(organizationId: string, args: Record<string, unknown>) {
    const tenantId = typeof args.tenantId === 'string' ? args.tenantId.trim() : '';
    const apartmentId = typeof args.apartmentId === 'string' ? args.apartmentId.trim() : '';
    const startDate = typeof args.startDate === 'string' ? args.startDate.trim() : '';
    const endDate = typeof args.endDate === 'string' ? args.endDate.trim() : '';
    const monthlyRent =
      typeof args.monthlyRent === 'number' && Number.isFinite(args.monthlyRent) ? args.monthlyRent : undefined;
    const depositAmount =
      typeof args.depositAmount === 'number' && Number.isFinite(args.depositAmount)
        ? args.depositAmount
        : undefined;
    const terms = typeof args.terms === 'string' ? args.terms : undefined;
    const activate = args.activate === true;

    const missing: string[] = [];
    if (!tenantId) missing.push('tenantId');
    if (!apartmentId) missing.push('apartmentId');
    if (!startDate) missing.push('startDate');
    if (!endDate) missing.push('endDate');

    let tenant: { id: string; firstName: string; lastName: string } | null = null;
    let apartment: {
      id: string;
      label: string;
      status: ApartmentStatus;
      rentAmount: unknown;
    } | null = null;

    if (tenantId) {
      tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId, organizationId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!tenant) {
        return {
          ready: false,
          error: 'Locataire introuvable dans votre organisation.',
          missing,
          requiresUserConfirmation: true,
        };
      }
    }

    if (apartmentId) {
      apartment = await this.prisma.apartment.findFirst({
        where: { id: apartmentId, organizationId },
        select: { id: true, label: true, status: true, rentAmount: true },
      });
      if (!apartment) {
        return {
          ready: false,
          error: 'Logement introuvable dans votre organisation.',
          missing,
          requiresUserConfirmation: true,
        };
      }
      if (apartment.status !== ApartmentStatus.AVAILABLE) {
        return {
          ready: false,
          error: `Logement non disponible (statut : ${apartment.status}). Choisissez un logement AVAILABLE.`,
          missing,
          preview: {
            tenantId: tenant?.id,
            tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : undefined,
            apartmentId: apartment.id,
            apartmentLabel: apartment.label,
            apartmentStatus: apartment.status,
          },
          requiresUserConfirmation: true,
        };
      }
    }

    const rentFromApartment = apartment ? decimalToNumber(apartment.rentAmount as never) : undefined;
    const resolvedRent = monthlyRent ?? rentFromApartment;

    const preview = {
      tenantId: tenant?.id,
      tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : undefined,
      apartmentId: apartment?.id,
      apartmentLabel: apartment?.label,
      apartmentStatus: apartment?.status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      monthlyRent: resolvedRent,
      depositAmount,
      terms,
      activate,
    };

    if (missing.length) {
      return {
        ready: false,
        missing,
        preview,
        note: 'Indiquez les champs manquants — aucun ID ni montant inventé.',
        requiresUserConfirmation: true,
      };
    }

    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      return {
        ready: false,
        missing: ['endDate'],
        error: 'La date de fin doit être après la date de début.',
        preview,
        requiresUserConfirmation: true,
      };
    }

    return {
      ready: true,
      missing: [],
      preview,
      summary: `Créer le bail ${preview.tenantName} → ${preview.apartmentLabel} (${startDate} → ${endDate})${
        resolvedRent != null ? ` · ${resolvedRent.toLocaleString('fr-FR')} XAF/mois` : ''
      }${activate ? ' · activation demandée' : ' · brouillon'}`,
      requiresUserConfirmation: true,
    };
  }

  /** Valide une proposition d’envoi de message locataire — ne mute pas. */
  private async proposeSendTenantMessage(organizationId: string, args: Record<string, unknown>) {
    const tenantId = typeof args.tenantId === 'string' ? args.tenantId.trim() : '';
    const tenantNameSearch = typeof args.tenantName === 'string' ? args.tenantName.trim() : '';
    const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
    const body = typeof args.body === 'string' ? args.body.trim() : '';

    const missing: string[] = [];
    if (!body) missing.push('body');
    if (!tenantId && !tenantNameSearch) missing.push('tenantId|tenantName');

    let tenant: {
      id: string;
      firstName: string;
      lastName: string;
      userId: string | null;
    } | null = null;

    if (tenantId) {
      tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId, organizationId },
        select: { id: true, firstName: true, lastName: true, userId: true },
      });
      if (!tenant) {
        return {
          ready: false,
          error: 'Locataire introuvable dans votre organisation.',
          missing,
          requiresUserConfirmation: true,
        };
      }
    } else if (tenantNameSearch) {
      const parts = tenantNameSearch.split(/\s+/).filter(Boolean);
      const candidates = await this.prisma.tenant.findMany({
        where: {
          organizationId,
          OR: [
            { firstName: { contains: tenantNameSearch, mode: 'insensitive' } },
            { lastName: { contains: tenantNameSearch, mode: 'insensitive' } },
            ...(parts.length >= 2
              ? [
                  {
                    AND: [
                      { firstName: { contains: parts[0], mode: 'insensitive' as const } },
                      { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' as const } },
                    ],
                  },
                ]
              : []),
          ],
        },
        take: 8,
        select: { id: true, firstName: true, lastName: true, userId: true },
      });
      if (candidates.length === 0) {
        return {
          ready: false,
          error: `Aucun locataire trouvé pour « ${tenantNameSearch} ».`,
          missing,
          requiresUserConfirmation: true,
        };
      }
      if (candidates.length > 1) {
        return {
          ready: false,
          error: 'Plusieurs locataires correspondent — précisez tenantId.',
          candidates: candidates.map((t) => ({
            id: t.id,
            name: `${t.firstName} ${t.lastName}`,
            hasPortalUser: Boolean(t.userId),
          })),
          missing: ['tenantId'],
          requiresUserConfirmation: true,
        };
      }
      tenant = candidates[0];
    }

    if (!tenant) {
      return {
        ready: false,
        missing,
        note: 'Indiquez le locataire (tenantId ou nom) et le corps du message.',
        requiresUserConfirmation: true,
      };
    }

    if (!tenant.userId) {
      return {
        ready: false,
        error:
          `Le locataire ${tenant.firstName} ${tenant.lastName} n’a pas de compte portail (userId). ` +
          `Impossible d’envoyer un message interne — créez d’abord l’accès portail.`,
        preview: {
          tenantId: tenant.id,
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          subject: subject || undefined,
          body: body || undefined,
        },
        missing: ['recipientUserId'],
        requiresUserConfirmation: true,
      };
    }

    const preview = {
      recipientUserId: tenant.userId,
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      subject: subject || undefined,
      body: body || undefined,
    };

    if (missing.length) {
      return {
        ready: false,
        missing,
        preview,
        requiresUserConfirmation: true,
      };
    }

    return {
      ready: true,
      missing: [],
      preview,
      summary: `Message à ${preview.tenantName}${subject ? ` — ${subject}` : ''}`,
      requiresUserConfirmation: true,
    };
  }

  /** Valide une proposition WhatsApp — ne mute pas ; ne jamais inventer de numéro. */
  private async proposeSendWhatsAppMessage(organizationId: string, args: Record<string, unknown>) {
    if (!isWhatsAppConfigured) {
      return {
        ready: false,
        error:
          'WhatsApp n’est pas configuré sur ce serveur (WHATSAPP_ENABLED + WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID). ' +
          'Vous pouvez envoyer un message interne via le portail locataire.',
        requiresUserConfirmation: false,
      };
    }

    const tenantId = typeof args.tenantId === 'string' ? args.tenantId.trim() : '';
    const tenantNameSearch = typeof args.tenantName === 'string' ? args.tenantName.trim() : '';
    const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
    const body = typeof args.body === 'string' ? args.body.trim() : '';
    const toPhoneArg = typeof args.toPhone === 'string' ? args.toPhone.trim() : '';

    const missing: string[] = [];
    if (!body) missing.push('body');
    if (!tenantId && !tenantNameSearch) missing.push('tenantId|tenantName');

    let tenant: {
      id: string;
      firstName: string;
      lastName: string;
      userId: string | null;
      phone: string;
    } | null = null;

    if (tenantId) {
      tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId, organizationId },
        select: { id: true, firstName: true, lastName: true, userId: true, phone: true },
      });
      if (!tenant) {
        return {
          ready: false,
          error: 'Locataire introuvable dans votre organisation.',
          missing,
          requiresUserConfirmation: true,
        };
      }
    } else if (tenantNameSearch) {
      const parts = tenantNameSearch.split(/\s+/).filter(Boolean);
      const candidates = await this.prisma.tenant.findMany({
        where: {
          organizationId,
          OR: [
            { firstName: { contains: tenantNameSearch, mode: 'insensitive' } },
            { lastName: { contains: tenantNameSearch, mode: 'insensitive' } },
            ...(parts.length >= 2
              ? [
                  {
                    AND: [
                      { firstName: { contains: parts[0], mode: 'insensitive' as const } },
                      { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' as const } },
                    ],
                  },
                ]
              : []),
          ],
        },
        take: 8,
        select: { id: true, firstName: true, lastName: true, userId: true, phone: true },
      });
      if (candidates.length === 0) {
        return {
          ready: false,
          error: `Aucun locataire trouvé pour « ${tenantNameSearch} ».`,
          missing,
          requiresUserConfirmation: true,
        };
      }
      if (candidates.length > 1) {
        return {
          ready: false,
          error: 'Plusieurs locataires correspondent — précisez tenantId.',
          candidates: candidates.map((t) => ({
            id: t.id,
            name: `${t.firstName} ${t.lastName}`,
            phone: t.phone || null,
          })),
          missing: ['tenantId'],
          requiresUserConfirmation: true,
        };
      }
      tenant = candidates[0];
    }

    if (!tenant) {
      return {
        ready: false,
        missing,
        note: 'Indiquez le locataire (tenantId ou nom), le numéro si besoin, et le corps du message.',
        requiresUserConfirmation: true,
      };
    }

    const rawPhone = toPhoneArg || tenant.phone || '';
    if (!rawPhone) {
      return {
        ready: false,
        error: 'Ce locataire ne possède pas de numéro WhatsApp valide enregistré dans ITC.',
        preview: {
          tenantId: tenant.id,
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          subject: subject || undefined,
          body: body || undefined,
        },
        missing: ['toPhone'],
        requiresUserConfirmation: true,
      };
    }

    const toPhone = normalizePhoneE164(rawPhone, env.WHATSAPP_DEFAULT_COUNTRY_CODE);
    if (!toPhone || !isValidWhatsAppPhone(toPhone)) {
      return {
        ready: false,
        error: 'Ce locataire ne possède pas de numéro WhatsApp valide enregistré dans ITC.',
        preview: {
          tenantId: tenant.id,
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          toPhone: rawPhone,
          subject: subject || undefined,
          body: body || undefined,
        },
        missing: ['toPhone'],
        requiresUserConfirmation: true,
      };
    }

    const preview = {
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      toPhone,
      recipientUserId: tenant.userId ?? undefined,
      subject: subject || undefined,
      body: body || undefined,
      providerChannel: 'WHATSAPP' as const,
    };

    if (missing.length) {
      return {
        ready: false,
        missing,
        preview,
        requiresUserConfirmation: true,
      };
    }

    return {
      ready: true,
      missing: [],
      preview,
      summary: `WhatsApp à ${preview.tenantName} (${toPhone})${subject ? ` — ${subject}` : ''}`,
      requiresUserConfirmation: true,
    };
  }
}

export function formatToolResultForLocalReply(toolName: string, result: unknown): string {
  const data = result as Record<string, unknown>;
  if (toolName === 'getDashboardSummary' && data.summary) {
    const s = data.summary as Record<string, number>;
    const org = data.organization as { name?: string };
    return `Résumé « ${org?.name ?? 'Organisation'} » :
• ${s.totalApartments} biens · occupation ${s.occupancyRate} %
• ${Number(s.collectedThisMonthXaf).toLocaleString('fr-FR')} XAF encaissés ce mois
• ${s.latePayments} impayé(s) · ${s.availableApartments} vacant(s)
• ${s.activeLeases} contrats · ${s.totalTenants} locataires`;
  }
  if (toolName === 'getOutstandingPayments') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    const total = Number(data.totalRemainingXaf ?? 0);
    const filter = (data.filter as { period?: string | null; periodMonth?: number | null; periodYear?: number | null }) ?? {};
    const periodNote =
      filter.period === 'last_month'
        ? ` (mois dernier${filter.periodMonth && filter.periodYear ? ` ${filter.periodMonth}/${filter.periodYear}` : ''})`
        : filter.period === 'this_month'
          ? ` (ce mois${filter.periodMonth && filter.periodYear ? ` ${filter.periodMonth}/${filter.periodYear}` : ''})`
          : '';
    if (!items.length) {
      return `Aucun loyer à encaisser (PENDING / PARTIAL / LATE)${periodNote} sur vos données actuelles.`;
    }
    const list = items
      .slice(0, 12)
      .map((p) => {
        const remaining = Number(p.remainingXaf ?? p.amountXaf ?? 0);
        return `• ${p.tenantName} (${p.apartmentLabel}) — ${remaining.toLocaleString('fr-FR')} XAF · ${p.status} · échéance ${p.dueDate}`;
      })
      .join('\n');
    return `Vous avez ${data.count} loyer(s) à suivre${periodNote}${total > 0 ? ` pour un total restant de ${total.toLocaleString('fr-FR')} XAF` : ''} :
${list}`;
  }
  if (toolName === 'getVacantUnits') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun logement vacant.';
    const list = items
      .map(
        (a) =>
          `• ${a.label}${a.buildingName ? ` — ${a.buildingName}` : ''} — ${Number(a.rentXaf).toLocaleString('fr-FR')} XAF/mois`,
      )
      .join('\n');
    return `${data.count} logement(s) vacant(s) :\n${list}`;
  }
  if (toolName === 'getUnits') {
    const buildings = (data.buildings as Array<Record<string, unknown>>) ?? [];
    if (!Number(data.count)) return 'Aucun logement enregistré dans votre organisation.';
    const statusLabel = (s: unknown) => {
      switch (String(s)) {
        case 'OCCUPIED':
          return 'Occupé';
        case 'AVAILABLE':
          return 'Vacant';
        case 'MAINTENANCE':
          return 'Maintenance';
        case 'UNAVAILABLE':
          return 'Indisponible';
        default:
          return String(s ?? '—');
      }
    };
    const blocks = buildings.map((b) => {
      const units = (b.units as Array<Record<string, unknown>>) ?? [];
      const lines = units
        .map((u) => `• ${u.label} — ${statusLabel(u.status)}`)
        .join('\n');
      return `${b.buildingName}\n${lines}`;
    });
    return `Voici vos logements :

${blocks.join('\n\n')}

${data.count} logement(s) au total
${data.occupied} occupé(s) · ${data.vacant} vacant(s)${Number(data.maintenance) > 0 ? ` · ${data.maintenance} en maintenance` : ''}`;
  }
  if (toolName === 'getBuildings') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun immeuble enregistré.';
    const list = items
      .map(
        (b) =>
          `• ${b.name}${b.city ? ` (${b.city})` : ''} — ${b.apartmentsTotal} logement(s) · ${b.occupied} occupé(s) · ${b.vacant} vacant(s)`,
      )
      .join('\n');
    return `Immeubles (${data.count}) :\n${list}`;
  }
  if (toolName === 'getFinancialSummary') {
    const collected = Number(data.collectedThisMonthXaf);
    const potential = Number(data.potentialMonthlyRentXaf);
    const late = Number(data.latePayments ?? 0);
    const pending = Number(data.pendingPayments ?? 0);
    const gap = Math.max(0, potential - collected);
    const drivers: string[] = [];
    if (late > 0) drivers.push(`${late} loyer(s) en retard`);
    if (pending > 0) drivers.push(`${pending} paiement(s) encore en attente`);
    if (Number(data.occupancyRate) < 100) {
      drivers.push(`occupation à ${data.occupancyRate} % (vacance possible)`);
    }
    const analysis =
      gap > 0 && drivers.length
        ? `\nÉcart vs potentiel : ${gap.toLocaleString('fr-FR')} XAF. Facteurs observables dans vos données : ${drivers.join(', ')}.`
        : gap > 0
          ? `\nÉcart vs potentiel : ${gap.toLocaleString('fr-FR')} XAF (d’après vos données actuelles).`
          : '';
    return `Synthèse financière :
• Encaissé ce mois : ${collected.toLocaleString('fr-FR')} XAF
• Potentiel mensuel : ${potential.toLocaleString('fr-FR')} XAF
• Impayés : ${late} · En attente : ${pending}
• Occupation : ${data.occupancyRate} %${analysis}`;
  }
  if (toolName === 'getExpiringContracts') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun contrat n’expire dans les 30 prochains jours.';
    const list = items
      .map((l) => `• ${l.tenantName} — ${l.apartmentLabel} (fin : ${l.endDate})`)
      .join('\n');
    return `Contrats à échéance ≤ 30 j :\n${list}`;
  }
  if (toolName === 'getContracts' || toolName === 'proposeGenerateLeasePdf') {
    if (data.found && data.lease) {
      const l = data.lease as Record<string, unknown>;
      return `Bail trouvé : ${l.tenantName} — ${l.apartmentLabel} (${l.status}).
Confirmez la génération du PDF professionnel pour créer le document.`;
    }
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun contrat trouvé.';
    const list = items
      .slice(0, 8)
      .map((l) => `• ${l.tenantName} — ${l.apartmentLabel} (${l.status}) · id ${l.id}`)
      .join('\n');
    return `Contrats (${data.count}) :\n${list}`;
  }
  if (toolName === 'proposeGeneratePaymentReceipt') {
    if (data.found && data.payment) {
      const p = data.payment as Record<string, unknown>;
      return `Paiement trouvé : ${p.tenantName} — ${p.apartmentLabel} (${p.period}, ${p.status}).
Confirmez pour générer le reçu PDF.`;
    }
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun paiement enregistré pouvant recevoir un reçu.';
    const list = items
      .slice(0, 8)
      .map(
        (p) =>
          `• ${p.tenantName} — ${p.apartmentLabel} (${p.period}) · ${Number(p.amountPaidXaf).toLocaleString('fr-FR')} XAF · id ${p.id}`,
      )
      .join('\n');
    return `Paiements payés (${data.count}) — indiquez un id ou confirmez le plus récent :\n${list}`;
  }
  if (toolName === 'proposeGeneratePaymentNotice') {
    if (data.found && data.payment) {
      const p = data.payment as Record<string, unknown>;
      return `Loyer à rappeler : ${p.tenantName} — ${p.apartmentLabel} (${p.period}, ${p.status}).
Confirmez pour générer l’avis de paiement PDF.`;
    }
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun loyer en attente ou en retard pour un avis.';
    const list = items
      .slice(0, 8)
      .map(
        (p) =>
          `• ${p.tenantName} — ${p.apartmentLabel} (${p.period}) · dû ${Number(p.amountDueXaf).toLocaleString('fr-FR')} XAF · id ${p.id}`,
      )
      .join('\n');
    return `Loyers à rappeler (${data.count}) :\n${list}`;
  }
  if (toolName === 'proposeCreateLease') {
    if (typeof data.error === 'string') {
      return `${data.error}${
        Array.isArray(data.missing) && data.missing.length
          ? `\nChamps manquants : ${(data.missing as string[]).join(', ')}.`
          : ''
      }`;
    }
    const preview = (data.preview as Record<string, unknown>) ?? {};
    const missing = (data.missing as string[]) ?? [];
    if (data.ready) {
      return (
        `Proposition de création de bail :\n` +
        `• Locataire : ${preview.tenantName ?? '—'} (${preview.tenantId})\n` +
        `• Logement : ${preview.apartmentLabel ?? '—'} (${preview.apartmentId})\n` +
        `• Période : ${preview.startDate} → ${preview.endDate}\n` +
        `• Loyer : ${
          preview.monthlyRent != null
            ? `${Number(preview.monthlyRent).toLocaleString('fr-FR')} XAF/mois`
            : '— (sera pris sur le logement)'
        }\n` +
        `• Mode : ${preview.activate ? 'activation après création' : 'brouillon'}\n\n` +
        `Confirmez pour créer le contrat, ou annulez.`
      );
    }
    return (
      `Création de bail incomplète.\n` +
      (missing.length ? `Champs manquants : ${missing.join(', ')}.\n` : '') +
      `Indiquez locataire, logement, date de début et de fin — sans inventer d’identifiants.`
    );
  }
  if (toolName === 'proposeSendTenantMessage') {
    if (typeof data.error === 'string') {
      const candidates = (data.candidates as Array<Record<string, unknown>>) ?? [];
      const list = candidates.length
        ? `\nCorrespondances :\n${candidates
            .map((c) => `• ${c.name} · id ${c.id}${c.hasPortalUser ? '' : ' (pas de compte portail)'}`)
            .join('\n')}`
        : '';
      return `${data.error}${list}`;
    }
    const preview = (data.preview as Record<string, unknown>) ?? {};
    const missing = (data.missing as string[]) ?? [];
    if (data.ready) {
      return (
        `Message proposé :\n` +
        `• Destinataire : ${preview.tenantName} (compte portail)\n` +
        `• Objet : ${preview.subject ?? '(sans objet)'}\n` +
        `• Corps : ${String(preview.body ?? '').slice(0, 280)}\n\n` +
        `Confirmez pour envoyer, ou annulez.`
      );
    }
    return (
      `Envoi de message incomplet.\n` +
      (missing.length ? `Champs manquants : ${missing.join(', ')}.\n` : '') +
      `Précisez le locataire et le texte du message.`
    );
  }
  if (toolName === 'proposeSendWhatsAppMessage') {
    if (typeof data.error === 'string') {
      const candidates = (data.candidates as Array<Record<string, unknown>>) ?? [];
      const list = candidates.length
        ? `\nCorrespondances :\n${candidates
            .map((c) => `• ${c.name} · id ${c.id}${c.phone ? ` · ${c.phone}` : ''}`)
            .join('\n')}`
        : '';
      return `${data.error}${list}`;
    }
    const preview = (data.preview as Record<string, unknown>) ?? {};
    const missing = (data.missing as string[]) ?? [];
    if (data.ready) {
      const name = String(preview.tenantName ?? 'le locataire');
      const bodyPreview = String(preview.body ?? '').slice(0, 500);
      return (
        `Je vais envoyer ce message WhatsApp à ${name} :\n\n` +
        `“${bodyPreview}”\n\n` +
        `Téléphone : ${preview.toPhone}\n\n` +
        `[Confirmer l’envoi] / [Annuler]`
      );
    }
    return (
      `Envoi WhatsApp incomplet.\n` +
      (missing.length ? `Champs manquants : ${missing.join(', ')}.\n` : '') +
      `Précisez le locataire, un numéro valide et le texte.`
    );
  }
  if (toolName === 'proposeSendWhatsAppMedia') {
    return (
      (typeof data.error === 'string' ? data.error : null) ||
      'Envoi WhatsApp audio/image non encore disponible. Utilisez un message texte.'
    );
  }
  if (toolName === 'rememberMemory') {
    if (data.enabled === false) return String(data.error ?? 'Mémoire IA désactivée');
    if (typeof data.error === 'string') return data.error;
    if (data.remembered) {
      const scope = data.scope === 'ORGANIZATION' ? 'organisation' : 'utilisateur';
      return `C’est noté (mémoire ${scope})${data.key ? ` · clé « ${data.key} »` : ''} : « ${String(data.content ?? '').slice(0, 200)} ».`;
    }
    return 'Mémoire non enregistrée.';
  }
  if (toolName === 'recallMemories') {
    if (data.enabled === false) return String(data.error ?? 'Mémoire IA désactivée');
    if (typeof data.error === 'string') return data.error;
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucune mémoire enregistrée pour vous / votre organisation.';
    const seen = new Set<string>();
    const list = items
      .slice(0, 12)
      .filter((m) => {
        const n = String(m.content ?? '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
        if (!n || seen.has(n)) return false;
        seen.add(n);
        return true;
      })
      .map((m) => {
        return `• ${String(m.content ?? '').slice(0, 180)}`;
      })
      .join('\n');
    return `Voici ce que je retiens pour vous :\n${list}`;
  }
  if (toolName === 'forgetMemory') {
    if (data.enabled === false) return String(data.error ?? 'Mémoire IA désactivée');
    if (typeof data.error === 'string') return data.error;
    if (data.deleted) return `Mémoire oubliée${data.key ? ` (« ${data.key} »)` : ''}.`;
    if (data.reason === 'not_found') return 'Aucune mémoire correspondante à oublier.';
    return 'Suppression mémoire non effectuée.';
  }
  if (
    toolName === 'proposeOutstandingReminderAutomation' ||
    toolName === 'proposeLeaseExpiryReminders' ||
    toolName === 'proposeMaintenanceTasksFromTickets' ||
    toolName === 'proposeAnomalyActions'
  ) {
    const n = Number(data.itemCount ?? 0);
    if (data.skippedDuplicate) {
      return String(
        data.summary ??
          'Automatisation déjà traitée pour cette clé (anti-doublon) — aucune nouvelle proposition.',
      );
    }
    if (data.duplicate && data.requiresConfirmation) {
      return (
        `${String(data.summary ?? 'Proposition existante réutilisée.')}\n` +
        `Run ${data.runId ?? 'n/c'} · ${n} élément(s). Confirmez pour exécuter.`
      );
    }
    if (n === 0) {
      return String(data.summary ?? 'Aucun élément détecté — aucune proposition.');
    }
    if (data.autoExecuted) {
      return String(data.summary ?? 'Automatisation exécutée via règle autoExecute.');
    }
    return (
      `${String(data.summary ?? `${n} élément(s) proposés.`)}\n` +
      `Confirmation requise (APPROVE_AUTOMATION_RUN). Aucun envoi silencieux.`
    );
  }
  if (toolName === 'listAutomationRuns') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun run d’automatisation pour cette organisation.';
    const list = items
      .slice(0, 12)
      .map((r) => `• ${r.kind} · ${r.status} · ${r.id} · ${String(r.createdAt ?? '').slice(0, 19)}`)
      .join('\n');
    return `Runs automatisation (${data.count}) :\n${list}`;
  }
  if (toolName === 'getTenants') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun locataire enregistré.';
    const list = items
      .slice(0, 12)
      .map((t) => `• ${t.name} — ${t.phone}${t.leasesCount ? ` · ${t.leasesCount} bail(s)` : ''}`)
      .join('\n');
    return `Locataires (${data.count}) :\n${list}`;
  }
  if (toolName === 'getTeamMembers') {
    if (typeof data.error === 'string') {
      const code = typeof data.code === 'number' ? data.code : null;
      if (code === 401) return 'Vous n’êtes pas authentifié. Reconnectez-vous puis réessayez.';
      if (code === 403) return 'Permission insuffisante pour consulter l’équipe.';
      if (code === 404) return 'Ressource équipe introuvable.';
      if (code === 500) return 'Erreur serveur lors de la lecture de l’équipe. Réessayez plus tard.';
      return `Impossible d’accéder aux agents : ${data.error}`;
    }
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    const filter = (data.filter as { role?: string | null }) ?? {};
    if (!items.length) {
      return filter.role === 'AGENT'
        ? 'Vous n’avez actuellement aucun agent enregistré dans votre équipe.'
        : 'Aucun collaborateur trouvé pour ces critères.';
    }

    // Homonymes : ne jamais fusionner — distinguer via email/tél ou réf. userId (pas le nom).
    const nameCounts = new Map<string, number>();
    for (const m of items) {
      const key = String(m.fullName ?? '')
        .trim()
        .toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }

    const list = items.slice(0, 30).map((m, index) => {
      const status = m.isActive ? 'Actif' : 'Inactif';
      const name = String(m.fullName ?? '').trim() || 'Sans nom';
      const key = name.toLowerCase();
      const loginId =
        typeof m.loginId === 'string' && m.loginId.trim() ? m.loginId.trim() : '';
      const email = typeof m.email === 'string' && m.email.trim() ? m.email.trim() : '';
      let detail = '';
      if (loginId) detail += ` · LoginId ${loginId}`;
      else if (email) detail += ` · ${email}`;
      if ((nameCounts.get(key) ?? 0) > 1 && !loginId) {
        const phone = typeof m.phone === 'string' && m.phone.trim() ? m.phone.trim() : '';
        const id = typeof m.id === 'string' ? m.id : '';
        const disambiguator = email || phone || (id ? `réf. ${id.slice(-6)}` : '');
        if (disambiguator && !detail.includes(disambiguator)) detail += ` · ${disambiguator}`;
      }
      return `${index + 1}. ${name} — ${m.roleLabel ?? m.role} — ${status}${detail}`;
    });

    const noun = filter.role === 'AGENT' ? 'agents' : 'collaborateurs';
    const hint =
      filter.role === 'AGENT'
        ? '\n\nPour le détail : menu → Équipe → fiche agent (LoginId + statut). Le mot de passe temporaire n’est montré qu’à la création.'
        : '';
    return `Vous avez actuellement ${data.count} ${noun} :\n\n${list.join('\n')}${hint}`;
  }
  if (toolName === 'analyzePortfolio') {
    if (data.snapshot && data.periodCompare) {
      const s = data.snapshot as Record<string, unknown>;
      const cmp = data.periodCompare as Record<string, unknown>;
      const pa = cmp.periodA as { month?: number; year?: number };
      const pb = cmp.periodB as { month?: number; year?: number };
      const buildings = (data.topBuildingsOutstanding as Array<Record<string, unknown>>) ?? [];
      const issues = (data.topUrgentIssues as Array<Record<string, unknown>>) ?? [];
      const sources = (data.dataSources as string[]) ?? [];
      const dir =
        cmp.direction === 'up' ? 'hausse' : cmp.direction === 'down' ? 'baisse' : 'stable';
      const bList = buildings.length
        ? buildings
            .map(
              (b, i) =>
                `${i + 1}. ${b.buildingName} — ${Number(b.outstandingTotalXaf).toLocaleString('fr-FR')} XAF (${b.outstandingCount} impayé(s), ${b.tenantCountAffected} locataire(s))`,
            )
            .join('\n')
        : 'Aucun impayé groupé par immeuble.';
      const iList = issues.length
        ? issues.map((u, i) => `${i + 1}. [${u.severity}] ${u.label} — ${u.why}`).join('\n')
        : 'Aucun problème urgent détecté dans vos données.';
      return (
        `Synthèse parc (au ${String(data.asOf).slice(0, 10)}, ${data.currency}) :\n` +
        `• ${s.buildingsCount} immeuble(s) · ${s.unitsCount} logement(s) · occupation ${s.occupancyRate} %\n` +
        `• Occupés ${s.occupiedUnits} · vacants ${s.vacantUnits} · locataires ${s.tenantsCount}\n` +
        `• Baux actifs ${s.activeLeasesCount} · brouillons ${s.draftLeasesCount}\n` +
        `• Impayés : ${s.outstandingCount} · ${Number(s.outstandingTotalXaf).toLocaleString('fr-FR')} XAF\n` +
        `• Encaissé ce mois : ${Number(s.collectedThisMonthXaf).toLocaleString('fr-FR')} XAF\n` +
        `• Revenus ${pa?.month}/${pa?.year} → ${pb?.month}/${pb?.year} : ` +
        `${Number(cmp.revenueA).toLocaleString('fr-FR')} → ${Number(cmp.revenueB).toLocaleString('fr-FR')} XAF ` +
        `(Δ ${Number(cmp.deltaXaf).toLocaleString('fr-FR')}` +
        `${cmp.deltaPct != null ? `, ${cmp.deltaPct} %` : ''} · ${dir})\n\n` +
        `Top immeubles (impayés) :\n${bList}\n\n` +
        `Problèmes urgents :\n${iList}\n\n` +
        `Sources : ${sources.length ? sources.join(', ') : 'Prisma analytics'}.`
      );
    }
    // snapshot seul
    return (
      `Snapshot parc (au ${String(data.asOf ?? '').slice(0, 10)}, ${data.currency ?? 'XAF'}) :\n` +
      `• ${data.buildingsCount ?? 0} immeuble(s) · ${data.unitsCount ?? 0} logement(s) · occupation ${data.occupancyRate ?? 0} %\n` +
      `• Occupés ${data.occupiedUnits ?? 0} · vacants ${data.vacantUnits ?? 0}\n` +
      `• Locataires ${data.tenantsCount ?? 0} · baux actifs ${data.activeLeasesCount ?? 0} · brouillons ${data.draftLeasesCount ?? 0}\n` +
      `• Impayés ${data.outstandingCount ?? 0} · ${Number(data.outstandingTotalXaf ?? 0).toLocaleString('fr-FR')} XAF\n` +
      `• Encaissé ce mois : ${Number(data.collectedThisMonthXaf ?? 0).toLocaleString('fr-FR')} XAF`
    );
  }
  if (toolName === 'compareRevenue') {
    const pa = data.periodA as { month?: number; year?: number };
    const pb = data.periodB as { month?: number; year?: number };
    const dir =
      data.direction === 'up' ? 'hausse' : data.direction === 'down' ? 'baisse' : 'stable';
    const pct =
      data.deltaPct == null ? 'n/a (période A = 0)' : `${data.deltaPct} %`;
    return (
      `Comparaison revenus (${data.currency ?? 'XAF'}) :\n` +
      `• Période A ${pa?.month}/${pa?.year} : ${Number(data.revenueA ?? 0).toLocaleString('fr-FR')} XAF\n` +
      `• Période B ${pb?.month}/${pb?.year} : ${Number(data.revenueB ?? 0).toLocaleString('fr-FR')} XAF\n` +
      `• Écart : ${Number(data.deltaXaf ?? 0).toLocaleString('fr-FR')} XAF (${pct}) · tendance ${dir}`
    );
  }
  if (toolName === 'rankBuildingsByOutstanding') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) {
      return `Aucun impayé à classer par immeuble (au ${String(data.asOf ?? '').slice(0, 10)}).`;
    }
    const list = items
      .map(
        (b, i) =>
          `${i + 1}. ${b.buildingName} — ${Number(b.outstandingTotalXaf).toLocaleString('fr-FR')} XAF · ${b.outstandingCount} dossier(s) · ${b.tenantCountAffected} locataire(s)`,
      )
      .join('\n');
    return `Classement immeubles par impayés (au ${String(data.asOf).slice(0, 10)}, ${data.currency}) :\n${list}`;
  }
  if (toolName === 'explainRevenueChange') {
    if (data.sufficient === false) {
      return `Analyse revenus insuffisante (au ${String(data.asOf ?? '').slice(0, 10)}) : ${data.reason}`;
    }
    const tm = data.thisMonth as { month?: number; year?: number };
    const lm = data.lastMonth as { month?: number; year?: number };
    const dir =
      data.direction === 'up' ? 'hausse' : data.direction === 'down' ? 'baisse' : 'stable';
    const factors = (data.factors as Array<Record<string, unknown>>) ?? [];
    const flist = factors
      .map(
        (f) =>
          `• ${f.label} : ${Number(f.lastMonth).toLocaleString('fr-FR')} → ${Number(f.thisMonth).toLocaleString('fr-FR')} (Δ ${Number(f.delta).toLocaleString('fr-FR')})`,
      )
      .join('\n');
    return (
      `Évolution encaissements (au ${String(data.asOf).slice(0, 10)}, ${data.currency}) :\n` +
      `• ${lm?.month}/${lm?.year} : ${Number(data.collectedLastMonthXaf).toLocaleString('fr-FR')} XAF\n` +
      `• ${tm?.month}/${tm?.year} : ${Number(data.collectedThisMonthXaf).toLocaleString('fr-FR')} XAF\n` +
      `• Δ ${Number(data.deltaXaf).toLocaleString('fr-FR')} XAF` +
      `${data.deltaPct != null ? ` (${data.deltaPct} %)` : ''} · ${dir}\n\n` +
      `Facteurs mesurés :\n${flist || 'Aucun facteur calculable.'}`
    );
  }
  if (toolName === 'listUrgentIssues') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) {
      return `Aucun problème urgent détecté dans vos données (au ${String(data.asOf ?? '').slice(0, 10)}).`;
    }
    const list = items
      .map((u, i) => `${i + 1}. [${u.severity}] ${u.label}\n   → ${u.why}`)
      .join('\n');
    return `Problèmes les plus urgents (au ${String(data.asOf).slice(0, 10)}) :\n${list}`;
  }
  if (toolName === 'listDocumentsForAi') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) {
      return (
        'Aucun document analysable dans votre organisation (table Document, contractPdfUrl ou receiptPdfUrl).\n' +
        'Extraction OCR PDF : NOT_SUPPORTED · RAG : NOT_SUPPORTED.'
      );
    }
    const list = items
      .slice(0, 15)
      .map((d) => {
        const ids = [
          d.documentId ? `doc ${d.documentId}` : null,
          d.leaseId ? `lease ${d.leaseId}` : null,
          d.paymentId ? `pay ${d.paymentId}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return `• [${d.sourceType}] ${d.title}${ids ? ` (${ids})` : ''}${
          d.sourceUrl ? `\n  URL : ${d.sourceUrl}` : ''
        }`;
      })
      .join('\n');
    return (
      `Documents analysables (${data.count}) — métadonnées ITC uniquement :\n${list}\n\n` +
      `Extraction texte PDF : NOT_SUPPORTED (sauf clauses/terms déjà en base). RAG / recherche sémantique : NOT_SUPPORTED.`
    );
  }
  if (toolName === 'summarizeDocument') {
    if (data.found === false) {
      return `${String(data.error ?? 'Document introuvable.')}\nExtraction OCR PDF : NOT_SUPPORTED.`;
    }
    return String(data.summary ?? 'Résumé indisponible.');
  }
  if (toolName === 'extractDocumentFacts') {
    if (data.found === false) {
      return `${String(data.error ?? 'Faits introuvables.')}\nExtraction OCR PDF : NOT_SUPPORTED.`;
    }
    const f = (data.facts as Record<string, unknown>) ?? {};
    const parties = (f.parties as Record<string, unknown>) ?? {};
    const rent = (f.rent as Record<string, unknown>) ?? {};
    const dates = (f.dates as Record<string, unknown>) ?? {};
    const status = (f.status as Record<string, unknown>) ?? {};
    const lines = [
      `Faits documentaires (Prisma) — ${f.title ?? 'document'}`,
      parties.tenantName ? `• Locataire : ${parties.tenantName}` : null,
      parties.apartmentLabel ? `• Logement : ${parties.apartmentLabel}` : null,
      rent.monthlyRentXaf != null
        ? `• Loyer : ${Number(rent.monthlyRentXaf).toLocaleString('fr-FR')} XAF/mois`
        : null,
      dates.startDate || dates.endDate
        ? `• Période : ${dates.startDate ?? '—'} → ${dates.endDate ?? '—'}`
        : null,
      status.leaseStatus ? `• Statut bail : ${status.leaseStatus}` : null,
      f.sourceUrl ? `• URL : ${f.sourceUrl}` : null,
      f.leaseId ? `• leaseId : ${f.leaseId}` : null,
      f.paymentId ? `• paymentId : ${f.paymentId}` : null,
      f.documentId ? `• documentId : ${f.documentId}` : null,
      `• Extraction texte PDF : ${f.textExtraction === 'BUFFER_EXCERPT' ? 'extrait (terms)' : 'NOT_SUPPORTED / METADATA_ONLY'}`,
    ].filter(Boolean);
    return lines.join('\n');
  }
  if (toolName === 'askAboutDocument') {
    return String(
      data.answer ??
        'Je ne dispose pas de cette information dans le document / dossier ITC.',
    );
  }
  if (toolName === 'checkLeaseDocumentConsistency') {
    if (data.found === false) {
      return String(data.error ?? 'Bail introuvable.');
    }
    const items = (data.inconsistencies as Array<Record<string, unknown>>) ?? [];
    if (!items.length) {
      return `Aucune incohérence détectée sur le bail ${data.leaseId} (règles loyer / locataire / statut-dates).`;
    }
    const list = items
      .map((i) => `• [${i.severity}/${i.code}] ${i.message}`)
      .join('\n');
    return `Incohérences dossier (${data.count}) pour leaseId ${data.leaseId} :\n${list}`;
  }
  if (toolName === 'compareDocuments') {
    if (data.supported === false) {
      return `${String(data.message ?? 'Comparaison documentaire non encore disponible.')} (NOT_SUPPORTED)`;
    }
    const diffs = (data.differences as Array<Record<string, unknown>>) ?? [];
    if (data.identical || !diffs.length) {
      return `Comparaison baux ${data.leaseIdA} vs ${data.leaseIdB} : faits structurés identiques sur les champs comparés.`;
    }
    const list = diffs
      .map((d) => `• ${d.field} : ${d.a ?? '—'} → ${d.b ?? '—'}`)
      .join('\n');
    return `Comparaison baux ${data.leaseIdA} vs ${data.leaseIdB} :\n${list}`;
  }
  return JSON.stringify(result).slice(0, 1200);
}

/** Intent mémoire — retien / rappelle / oublie (FR). */
export function resolveMemoryLocalIntent(
  originalMessage: string,
  qNormalized: string,
): LocalToolIntent | null {
  const q = qNormalized;

  const wantsForget =
    q.includes('oublie') ||
    q.includes('supprime de ta memoire') ||
    q.includes('supprime de ta mémoire') ||
    /\bforget\b/.test(q);
  if (wantsForget) {
    const keyMatch =
      originalMessage.match(/(?:clé|cle|key)\s*[:=]?\s*([a-zA-Z0-9_.-]+)/i)?.[1] ||
      originalMessage.match(/(?:mémoire|memoire)\s+(?:id\s*)?(c[a-z0-9]{20,})/i)?.[1];
    const args: Record<string, unknown> = {};
    if (keyMatch) {
      if (keyMatch.startsWith('c') && keyMatch.length >= 20) args.memoryId = keyMatch;
      else args.key = keyMatch;
    }
    return { name: 'forgetMemory', args };
  }

  const wantsRecall =
    q.includes('rappelle') ||
    q.includes('souvenir') ||
    q.includes('que retiens') ||
    q.includes('mes preferences') ||
    q.includes('mes préférences') ||
    q.includes('preferences memoris') ||
    q.includes('préférences mémoris') ||
    q.includes('preferences memorise') ||
    q.includes('ce que tu retiens');
  if (wantsRecall) {
    return { name: 'recallMemories', args: {} };
  }

  const wantsRemember =
    /\bretien\b/.test(q) ||
    /\bretiens\b/.test(q) ||
    q.includes('memorise') ||
    q.includes('mémorise') ||
    q.includes('souviens-toi') ||
    q.includes('souviens toi');
  if (wantsRemember) {
    let content = '';
    const afterQue = originalMessage.match(
      /(?:retiens?|m[ée]morise|souviens[- ]toi)\s+(?:que\s+|:\s*)([\s\S]+)/i,
    );
    if (afterQue?.[1]) content = afterQue[1].trim();
    else {
      const afterColon = originalMessage.match(/:\s*([\s\S]+)/);
      if (afterColon?.[1]) content = afterColon[1].trim();
    }
    if (!content) {
      content = originalMessage
        .replace(/^(retiens?|m[ée]morise|souviens[- ]toi)\s*/i, '')
        .trim();
    }
    const scope = /organisation|organization|org\b/i.test(originalMessage)
      ? 'ORGANIZATION'
      : 'USER';
    return {
      name: 'rememberMemory',
      args: { content, scope },
    };
  }

  return null;
}

/** Intent équipe / agents — hors questions maintenance d’affectation. */
export function resolveTeamMembersLocalIntent(qNormalized: string): LocalToolIntent | null {
  const q = qNormalized;
  // Uniquement « comment créer/ajouter » — pas « comment me connecter » / « où voir ».
  const isCreateHowto =
    (q.includes('creer') || q.includes('créer') || q.includes('ajout') || q.includes('provision')) &&
    !q.includes('identifiant') &&
    !q.includes('login') &&
    !q.includes('connect');

  // Agents terrain pour assignation maintenance → pas getTeamMembers.
  const isMaintenanceAssignQuery =
    q.includes('agent') &&
    (q.includes('maintenance') ||
      q.includes('intervention') ||
      q.includes('affectation') ||
      q.includes('affecte') ||
      q.includes('assign') ||
      (q.includes('disponible') && (q.includes('ticket') || q.includes('panne'))));

  if (isMaintenanceAssignQuery) return null;

  const wantsAgentIds =
    q.includes('identifiant') ||
    q.includes('loginid') ||
    q.includes('login id') ||
    (q.includes('login') && q.includes('agent')) ||
    (q.includes('credential') && q.includes('agent'));

  if (wantsAgentIds || (q.includes('agent') && !isCreateHowto)) {
    const args: Record<string, unknown> = { role: UserRole.AGENT };
    if (q.includes('actif') || q.includes('active')) {
      args.status = 'active';
    }
    return { name: 'getTeamMembers', args };
  }

  if (
    (q.includes('equipe') || q.includes('équipe') || q.includes('collaborateur')) &&
    !isCreateHowto
  ) {
    return { name: 'getTeamMembers', args: {} };
  }

  return null;
}

function extractCreateLeaseArgsFromMessage(message: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const tenantId = message.match(/tenantId\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  const apartmentId = message.match(/apartmentId\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  const startDate = message.match(/startDate\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i)?.[1]
    ?? message.match(/\bdu\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
  const endDate = message.match(/endDate\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i)?.[1]
    ?? message.match(/\bau\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
  if (tenantId) args.tenantId = tenantId;
  if (apartmentId) args.apartmentId = apartmentId;
  if (startDate) args.startDate = startDate;
  if (endDate) args.endDate = endDate;
  return args;
}

/** Refs documentaires depuis le message (cuid + kind lexical). */
function extractDocumentRefArgsFromMessage(
  message: string,
  qNormalized: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const q = qNormalized;
  const documentId = message.match(/documentId\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  const leaseId = message.match(/leaseId\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  const paymentId = message.match(/paymentId\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  const leaseIdA = message.match(/leaseIdA\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  const leaseIdB = message.match(/leaseIdB\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  if (documentId) args.documentId = documentId;
  if (leaseId) args.leaseId = leaseId;
  if (paymentId) args.paymentId = paymentId;
  if (leaseIdA) args.leaseIdA = leaseIdA;
  if (leaseIdB) args.leaseIdB = leaseIdB;

  if (!args.documentId && !args.leaseId && !args.paymentId) {
    const cuid = extractCuidFromText(message);
    if (cuid) {
      if (q.includes('recu') || q.includes('quittance') || q.includes('paiement') || q.includes('avis')) {
        args.paymentId = cuid;
      } else if (q.includes('document')) {
        args.documentId = cuid;
      } else {
        args.leaseId = cuid;
      }
    }
  }

  if (q.includes('recu') || q.includes('quittance')) args.kind = 'PAYMENT_RECEIPT';
  else if (q.includes('avis') && q.includes('paiement')) args.kind = 'PAYMENT_NOTICE';
  else if (q.includes('contrat') || q.includes('bail')) args.kind = 'LEASE_PDF';

  return args;
}

function extractSendTenantMessageArgsFromMessage(message: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const tenantId = message.match(/tenantId\s*[:=]?\s*(c[a-z0-9]{20,})/i)?.[1];
  if (tenantId) args.tenantId = tenantId;

  // « au locataire Prénom Nom : corps » / « à Prénom Nom : corps »
  const named = message.match(
    /(?:au\s+locataire|a\s+locataire|à\s+locataire|message[^\n]*?(?:a|à)|rappel[^\n]*?(?:a|à))\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]+(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]+)+)\s*[:\-–]\s*(.+)$/i,
  );
  if (named) {
    args.tenantName = named[1].trim();
    args.body = named[2].trim();
  } else {
    const locataire = message.match(
      /locataire\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]+(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]+)+)/i,
    );
    if (locataire) args.tenantName = locataire[1].trim();
    const colon = message.match(/:\s*(.+)$/s);
    if (colon?.[1]?.trim()) args.body = colon[1].trim();
    if (!args.tenantName) {
      const nameOnly = message.match(
        /(?:a|à)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]+(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]+)+)/i,
      );
      if (nameOnly) args.tenantName = nameOnly[1].trim();
    }
  }
  if (!args.subject && args.body) args.subject = 'Message ITC';
  return args;
}

function extractSendWhatsAppMessageArgsFromMessage(message: string): Record<string, unknown> {
  const args = extractSendTenantMessageArgsFromMessage(message);
  // Uniquement toPhone= explicite ou E.164 (+ / 00…) — ne jamais matcher une date ni un cuid.
  const explicit =
    message.match(/toPhone\s*[:=]\s*([+\d][\d\s.\-]{6,}\d)/i)?.[1] ||
    message.match(/(?:whatsapp|tel|phone|num[eé]ro)\s*[:=]?\s*(\+[\d\s.\-]{8,}\d)/i)?.[1] ||
    message.match(/(?<![\w])(\+(?:242)?0?\d[\d\s.\-]{6,}\d)(?![\w])/i)?.[1] ||
    message.match(/(?<![\w])(00(?:242)?0?\d[\d\s.\-]{6,}\d)(?![\w])/i)?.[1];
  if (explicit) {
    const candidate = explicit.trim();
    // Rejeter les faux positifs type dates ISO (20xx-xx-xx)
    if (!/^20\d{2}[-.\s]/.test(candidate)) {
      args.toPhone = candidate;
    }
  }
  if (!args.body) {
    if (/rappel\s+de\s+loyer/i.test(message)) {
      args.body =
        'Bonjour, ceci est un rappel concernant votre loyer. Merci de régulariser dès que possible. — ITC';
      args.subject = args.subject || 'Rappel de loyer';
    } else if (/rappel/i.test(message) && !args.body) {
      args.body = 'Bonjour, ceci est un rappel de votre propriétaire. — ITC';
      args.subject = args.subject || 'Rappel ITC';
    }
  }
  if (!args.subject && args.body) args.subject = 'WhatsApp ITC';
  return args;
}

function mapToolError(err: unknown): { error: string; code: number } {
  if (err instanceof ForbiddenError) {
    return { error: err.message || 'Permission refusée', code: 403 };
  }
  if (err instanceof AppError) {
    return { error: err.message, code: err.statusCode };
  }
  if (err instanceof Error && /network|econnrefused|etimedout|fetch failed/i.test(err.message)) {
    return { error: 'Erreur réseau', code: 503 };
  }
  return {
    error: err instanceof Error ? err.message : 'Erreur serveur',
    code: 500,
  };
}
