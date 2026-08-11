import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, LeaseStatus, PaymentStatus, UserRole } from '@prisma/client';
import type OpenAI from 'openai';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AppError, ForbiddenError } from '../../shared/errors/app.error.js';
import { normalizeRole } from '../../shared/auth/roles.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { TeamMembersService } from '../admin/team-members.service.js';
import { AiContextService } from './ai.context.service.js';

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
  | 'proposeGenerateLeasePdf'
  | 'proposeGeneratePaymentReceipt'
  | 'proposeGeneratePaymentNotice'
  | 'proposeCreateLease'
  | 'proposeSendTenantMessage';

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
        'Liste les loyers à encaisser : PENDING + PARTIAL + LATE (impayés / à payer / partiels). Montants restants réels.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
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
];

@injectable()
export class AiToolsService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AiContextService) private readonly contextService: AiContextService,
    @inject(TeamMembersService) private readonly teamMembers: TeamMembersService,
  ) {}

  async execute(
    organizationId: string,
    toolName: string,
    rawArgs: string | Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const args =
      typeof rawArgs === 'string'
        ? (JSON.parse(rawArgs || '{}') as Record<string, unknown>)
        : { ...(rawArgs ?? {}) };

    // Interdit : org inventée par le LLM — seul organizationId du JWT compte.
    delete args.organizationId;
    delete args.orgId;
    delete args.organization_id;

    try {
      switch (toolName as AiToolName) {
        case 'getDashboardSummary':
          return await this.getDashboardSummary(organizationId);
        case 'getOutstandingPayments':
          return await this.getOutstandingPayments(organizationId);
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
        default:
          return { error: `Outil inconnu: ${toolName}`, code: 404 };
      }
    } catch (err) {
      return mapToolError(err);
    }
  }

  /** Intent routing sans LLM — données réelles uniquement. */
  resolveLocalToolIntents(message: string): LocalToolIntent[] {
    const q = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    const tools: LocalToolIntent[] = [];
    const isHowto = q.includes('comment') || q.includes('comment faire') || q.includes('ou aller');

    if (
      q.includes('impay') ||
      q.includes('retard') ||
      q.includes('relanc') ||
      (q.includes('pas pay') && (q.includes('qui') || q.includes('locataire') || q.includes('encore'))) ||
      (q.includes('pas') && q.includes('pay') && (q.includes('encore') || q.includes('locataire') || q.includes('qui'))) ||
      (q.includes('doivent') && q.includes('payer')) ||
      (q.includes('montant') && (q.includes('impay') || q.includes('du')))
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

    const wantsUnits =
      !isHowto &&
      !wantsVacant &&
      (q.includes('logement') ||
        q.includes('appartement') ||
        /\bappart\b/.test(q) ||
        /\bmes biens\b/.test(q) ||
        /\bcombien\b.*\b(logement|appart|biens?)\b/.test(q) ||
        /\b(logement|appart|biens?).*\bcombien\b/.test(q) ||
        (q.includes('montre') && (q.includes('patrimoine') || q.includes('parc'))) ||
        q.includes('liste des biens') ||
        q.includes('liste des logements'));
    if (wantsUnits) {
      tools.push({ name: 'getUnits' });
    }

    if (
      !isHowto &&
      (q.includes('immeuble') || q.includes('residence') || q.includes('résidence')) &&
      !q.includes('plus') &&
      !q.includes('genere')
    ) {
      tools.push({ name: 'getBuildings' });
    }

    if (q.includes('expir') || q.includes('echeanc') || (q.includes('bientot') && q.includes('loyer'))) {
      tools.push({ name: 'getExpiringContracts' });
    }

    const wantsLeasePdf =
      (q.includes('contrat') || q.includes('bail')) &&
      (q.includes('gener') || q.includes('pdf') || q.includes('prepar'));
    const wantsCreateLease =
      (q.includes('contrat') || q.includes('bail')) &&
      (q.includes('cree') || q.includes('creer') || q.includes('nouveau') || q.includes('ouvrir')) &&
      !q.includes('pdf') &&
      !q.includes('gener');

    if (wantsCreateLease) {
      tools.push({ name: 'proposeCreateLease' });
    } else if (wantsLeasePdf) {
      tools.push({ name: 'proposeGenerateLeasePdf' });
    } else if (q.includes('contrat') || q.includes('bail')) {
      tools.push({ name: 'getContracts' });
    }
    if (
      (q.includes('recu') || q.includes('quittance')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar') || q.includes('fais'))
    ) {
      tools.push({ name: 'proposeGeneratePaymentReceipt' });
    }
    const wantsPdfNotice =
      (q.includes('avis de paiement') || (q.includes('avis') && q.includes('loyer')) || q.includes('rappel de loyer')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar') || q.includes('envoie') || q.includes('fais'));
    if (wantsPdfNotice) {
      tools.push({ name: 'proposeGeneratePaymentNotice' });
    }
    const wantsTenantMessage =
      !wantsPdfNotice &&
      ((q.includes('message') &&
        (q.includes('envoie') ||
          q.includes('envoyer') ||
          q.includes('ecrire') ||
          q.includes('ecris') ||
          q.includes('locataire'))) ||
        (q.includes('envoie') && q.includes('rappel') && !q.includes('avis') && !q.includes('loyer')) ||
        (q.includes('envoyer') && q.includes('rappel') && !q.includes('avis') && !q.includes('loyer')));
    if (wantsTenantMessage) {
      tools.push({ name: 'proposeSendTenantMessage' });
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
    if (q.includes('revenu') || q.includes('financ') || q.includes('encaiss')) {
      tools.push({ name: 'getFinancialSummary' });
    }
    if (
      q.includes('resume') ||
      q.includes('situation') ||
      q.includes('dashboard') ||
      (q.includes('patrimoine') && !wantsUnits) ||
      (q.includes('parc') && !wantsUnits && !q.includes('logement'))
    ) {
      tools.push({ name: 'getDashboardSummary' });
    }

    const teamIntent = resolveTeamMembersLocalIntent(q);
    if (teamIntent) tools.push(teamIntent);

    const seen = new Set<string>();
    return tools.filter((t) => {
      const key = `${t.name}:${JSON.stringify(t.args ?? {})}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

  private async getOutstandingPayments(organizationId: string) {
    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
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
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
      };
    });
    const totalRemainingXaf = items.reduce((sum, p) => sum + p.remainingXaf, 0);
    return {
      count: items.length,
      totalRemainingXaf,
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
    if (!items.length) return 'Aucun loyer à encaisser (PENDING / PARTIAL / LATE) sur vos données actuelles.';
    const list = items
      .slice(0, 12)
      .map((p) => {
        const remaining = Number(p.remainingXaf ?? p.amountXaf ?? 0);
        return `• ${p.tenantName} (${p.apartmentLabel}) — ${remaining.toLocaleString('fr-FR')} XAF · ${p.status} · échéance ${p.dueDate}`;
      })
      .join('\n');
    return `Vous avez ${data.count} loyer(s) à suivre${total > 0 ? ` pour un total restant de ${total.toLocaleString('fr-FR')} XAF` : ''} :
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
      let detail = '';
      if ((nameCounts.get(key) ?? 0) > 1) {
        const email = typeof m.email === 'string' && m.email.trim() ? m.email.trim() : '';
        const phone = typeof m.phone === 'string' && m.phone.trim() ? m.phone.trim() : '';
        const id = typeof m.id === 'string' ? m.id : '';
        const disambiguator = email || phone || (id ? `réf. ${id.slice(-6)}` : '');
        if (disambiguator) detail = ` · ${disambiguator}`;
      }
      return `${index + 1}. ${name} — ${m.roleLabel ?? m.role} — ${status}${detail}`;
    });

    const noun = filter.role === 'AGENT' ? 'agents' : 'collaborateurs';
    return `Vous avez actuellement ${data.count} ${noun} :\n\n${list.join('\n')}`;
  }
  return JSON.stringify(result).slice(0, 1200);
}

/** Intent équipe / agents — hors questions maintenance d’affectation. */
export function resolveTeamMembersLocalIntent(qNormalized: string): LocalToolIntent | null {
  const q = qNormalized;
  const isCreateHowto =
    q.includes('comment') ||
    q.includes('creer') ||
    q.includes('créer') ||
    q.includes('ajout') ||
    q.includes('provision');

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

  if (q.includes('agent') && !isCreateHowto) {
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
