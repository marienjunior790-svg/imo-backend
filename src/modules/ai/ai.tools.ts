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
  | 'getContracts'
  | 'getTenants'
  | 'getFinancialSummary'
  | 'getExpiringContracts'
  | 'getTeamMembers'
  | 'proposeGenerateLeasePdf'
  | 'proposeGeneratePaymentReceipt'
  | 'proposeGeneratePaymentNotice';

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
      description: 'Liste les loyers en retard (impayés) de l’organisation.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVacantUnits',
      description: 'Logements vacants / disponibles.',
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
    if (
      q.includes('impay') ||
      q.includes('retard') ||
      (q.includes('pas encore pay') && q.includes('locataire'))
    ) {
      tools.push({ name: 'getOutstandingPayments' });
    }
    if (q.includes('vacant') || q.includes('disponib') || q.includes('libre')) {
      tools.push({ name: 'getVacantUnits' });
    }
    if (q.includes('expir') || q.includes('echeanc')) {
      tools.push({ name: 'getExpiringContracts' });
    }
    if (
      (q.includes('contrat') || q.includes('bail')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar'))
    ) {
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
    if (
      (q.includes('avis de paiement') || (q.includes('avis') && q.includes('loyer')) || q.includes('rappel de loyer')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar') || q.includes('envoie') || q.includes('fais'))
    ) {
      tools.push({ name: 'proposeGeneratePaymentNotice' });
    }
    if (q.includes('locataire') && !q.includes('retirer') && !q.includes('ajout') && !q.includes('comment') && !q.includes('creer') && !q.includes('cree')) {
      tools.push({ name: 'getTenants' });
    }
    if (q.includes('revenu') || q.includes('financ') || q.includes('encaiss')) {
      tools.push({ name: 'getFinancialSummary' });
    }
    if (
      q.includes('patrimoine') ||
      q.includes('resume') ||
      q.includes('situation') ||
      q.includes('dashboard') ||
      q.includes('parc')
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
      where: { organizationId, status: PaymentStatus.LATE },
      take: 20,
      orderBy: { dueDate: 'asc' },
      include: {
        lease: { include: { tenant: true, apartment: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((p) => ({
        id: p.id,
        amountXaf: decimalToNumber(p.amount),
        dueDate: p.dueDate.toISOString().slice(0, 10),
        period: `${p.periodMonth}/${p.periodYear}`,
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
      })),
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
    if (!items.length) return 'Aucun loyer en retard sur les données actuelles.';
    const list = items
      .slice(0, 10)
      .map(
        (p) =>
          `• ${p.tenantName} (${p.apartmentLabel}) : ${Number(p.amountXaf).toLocaleString('fr-FR')} XAF — échéance ${p.dueDate}`,
      )
      .join('\n');
    return `${data.count} impayé(s) :\n${list}`;
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
  if (toolName === 'getFinancialSummary') {
    return `Synthèse financière :
• Encaissé ce mois : ${Number(data.collectedThisMonthXaf).toLocaleString('fr-FR')} XAF
• Potentiel mensuel : ${Number(data.potentialMonthlyRentXaf).toLocaleString('fr-FR')} XAF
• Impayés : ${data.latePayments} · En attente : ${data.pendingPayments}
• Occupation : ${data.occupancyRate} %`;
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
    const roleHint = filter.role === 'AGENT' ? 'agent' : 'collaborateur';
    if (!items.length) {
      return filter.role === 'AGENT'
        ? 'Vous n’avez actuellement aucun agent enregistré dans votre équipe.'
        : 'Aucun collaborateur trouvé pour ces critères.';
    }
    const list = items
      .slice(0, 30)
      .map((m) => {
        const status = m.isActive ? 'Actif' : 'Inactif';
        return `• ${m.fullName} — ${m.roleLabel ?? m.role} — ${status}`;
      })
      .join('\n');
    const noun = filter.role === 'AGENT' ? 'agent(s)' : 'collaborateur(s)';
    return `Voici les ${roleHint}s de votre équipe :\n${list}\n\nVous avez actuellement ${data.count} ${noun}.`;
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
    return { name: 'getTeamMembers', args: { role: UserRole.AGENT } };
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
