import { inject, injectable } from 'tsyringe';
import {
  AiAutomationKind,
  AiAutomationRunStatus,
  LeaseStatus,
  MaintenanceTicketStatus,
  PaymentStatus,
  Prisma,
  UserRole,
  type AiAutomationRule,
  type AiAutomationRun,
} from '@prisma/client';
import { env, isWhatsAppConfigured } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { normalizeRole } from '../../shared/auth/roles.js';
import { RbacService } from '../../shared/rbac/rbac.service.js';
import { AuditService } from '../../shared/services/audit.service.js';
import { isValidWhatsAppPhone, normalizePhoneE164 } from '../../shared/utils/phone.util.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { NotificationCenterService } from '../notification-center/notification-center.service.js';
import { AiAnalyticsService } from './ai.analytics.service.js';
import { buildReminderBody } from './ai.orchestrator.js';
import {
  createPendingAction,
  type BatchTenantReminderItem,
  type PendingAction,
} from './ai.pending-actions.js';

export type AutomationChannel = 'IN_APP' | 'WHATSAPP';

export type AutomationRuleConfig = {
  daysBeforeExpiry?: number;
  channel?: AutomationChannel;
  maxItems?: number;
};

export type DetectionFinding = {
  kind: AiAutomationKind;
  idempotencyKey: string;
  itemCount: number;
  summary: string;
  items: Array<Record<string, unknown>>;
};

export type ProposalDraft = {
  action: 'SEND_REMINDER' | 'CREATE_REMINDER' | 'CREATE_STAFF_TASK' | 'NAVIGATE' | 'NOOP';
  summary: string;
  payload: Record<string, unknown>;
};

export type ProposeAutomationInput = {
  organizationId: string;
  userId: string;
  kind: AiAutomationKind;
  detection: DetectionFinding;
  ruleId?: string;
  /** If true and rule.autoExecute, execute immediately after propose (still verifies). */
  allowAutoExecute?: boolean;
  role?: UserRole;
};

export type ProposeAutomationResult = {
  run: AiAutomationRun | null;
  pendingAction: PendingAction | null;
  duplicate: boolean;
  skippedDuplicate: boolean;
  autoExecuted: boolean;
  itemCount: number;
  summary: string;
};

const UNFINISHED: AiAutomationRunStatus[] = [
  AiAutomationRunStatus.DETECTED,
  AiAutomationRunStatus.PROPOSED,
  AiAutomationRunStatus.APPROVED,
  AiAutomationRunStatus.EXECUTING,
];

const TERMINAL_DONE: AiAutomationRunStatus[] = [
  AiAutomationRunStatus.SUCCEEDED,
  AiAutomationRunStatus.PARTIAL,
];

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function asConfig(raw: unknown): AutomationRuleConfig {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const daysBeforeExpiry =
    typeof o.daysBeforeExpiry === 'number' && Number.isFinite(o.daysBeforeExpiry)
      ? Math.max(1, Math.min(365, Math.floor(o.daysBeforeExpiry)))
      : undefined;
  const maxItems =
    typeof o.maxItems === 'number' && Number.isFinite(o.maxItems)
      ? Math.max(1, Math.min(50, Math.floor(o.maxItems)))
      : undefined;
  const channel =
    o.channel === 'WHATSAPP' || o.channel === 'IN_APP' ? (o.channel as AutomationChannel) : undefined;
  return { daysBeforeExpiry, maxItems, channel };
}

function draftsFromDetection(
  kind: AiAutomationKind,
  detection: DetectionFinding,
): ProposalDraft[] {
  const drafts: ProposalDraft[] = [];
  for (const item of detection.items) {
    if (kind === AiAutomationKind.OUTSTANDING_REMINDER) {
      drafts.push({
        action: 'SEND_REMINDER',
        summary: `Relance ${String(item.tenantName ?? 'locataire')}`,
        payload: { ...item },
      });
    } else if (kind === AiAutomationKind.LEASE_EXPIRY_REMINDER) {
      drafts.push({
        action: 'CREATE_REMINDER',
        summary: `Échéance bail ${String(item.tenantName ?? item.leaseId ?? '')}`,
        payload: { ...item },
      });
    } else if (kind === AiAutomationKind.MAINTENANCE_ASSIGN_TASK) {
      drafts.push({
        action: 'CREATE_STAFF_TASK',
        summary: `Tâche ticket ${String(item.ticketId ?? '')}`,
        payload: { ...item },
      });
    } else if (kind === AiAutomationKind.ANOMALY_ACTION) {
      const actionType = String(item.proposedAction ?? 'NAVIGATE');
      if (actionType === 'CREATE_STAFF_TASK') {
        drafts.push({
          action: 'CREATE_STAFF_TASK',
          summary: String(item.label ?? 'Tâche anomaly'),
          payload: { ...item },
        });
      } else if (actionType === 'CREATE_REMINDER' || actionType === 'SEND_REMINDER') {
        drafts.push({
          action: actionType === 'SEND_REMINDER' ? 'SEND_REMINDER' : 'CREATE_REMINDER',
          summary: String(item.label ?? 'Rappel anomaly'),
          payload: { ...item },
        });
      } else {
        drafts.push({
          action: 'NAVIGATE',
          summary: String(item.label ?? 'Consulter anomaly'),
          payload: { ...item },
        });
      }
    }
  }
  return drafts;
}

@injectable()
export class AiAutomationService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(NotificationCenterService) private readonly notificationCenter: NotificationCenterService,
    @inject(AiAnalyticsService) private readonly analytics: AiAnalyticsService,
    @inject(RbacService) private readonly rbac: RbacService,
    @inject(AuditService) private readonly audit: AuditService,
  ) {}

  async detect(
    kind: AiAutomationKind,
    organizationId: string,
    config?: AutomationRuleConfig,
  ): Promise<DetectionFinding> {
    const maxItems = config?.maxItems ?? 20;
    if (kind === AiAutomationKind.OUTSTANDING_REMINDER) {
      return this.detectOutstanding(organizationId, maxItems, config?.channel);
    }
    if (kind === AiAutomationKind.LEASE_EXPIRY_REMINDER) {
      return this.detectLeaseExpiry(organizationId, config?.daysBeforeExpiry ?? 30, maxItems);
    }
    if (kind === AiAutomationKind.MAINTENANCE_ASSIGN_TASK) {
      return this.detectOpenMaintenance(organizationId, maxItems);
    }
    return this.detectAnomalies(organizationId, maxItems);
  }

  async propose(input: ProposeAutomationInput): Promise<ProposeAutomationResult> {
    const { organizationId, userId, kind, detection, ruleId } = input;
    const idempotencyKey = detection.idempotencyKey;

    const existing = await this.prisma.aiAutomationRun.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    });

    if (existing) {
      if (UNFINISHED.includes(existing.status)) {
        const pending = await this.ensurePendingForRun(existing, organizationId, userId);
        return {
          run: existing,
          pendingAction: pending,
          duplicate: true,
          skippedDuplicate: false,
          autoExecuted: false,
          itemCount: detection.itemCount,
          summary: `Proposition existante réutilisée (${existing.status}) — confirmation requise.`,
        };
      }
      if (TERMINAL_DONE.includes(existing.status) || existing.status === AiAutomationRunStatus.SKIPPED_DUPLICATE) {
        return {
          run: existing,
          pendingAction: null,
          duplicate: true,
          skippedDuplicate: true,
          autoExecuted: false,
          itemCount: detection.itemCount,
          summary:
            `Automatisation déjà traitée aujourd’hui (statut ${existing.status}, run ${existing.id}). ` +
            `Aucune nouvelle proposition — anti-doublon.`,
        };
      }
      // CANCELLED / FAILED → allow re-propose by rewriting key suffix is not done;
      // unique constraint blocks new row — update in place to PROPOSED.
    }

    if (detection.itemCount === 0 || detection.items.length === 0) {
      return {
        run: null,
        pendingAction: null,
        duplicate: false,
        skippedDuplicate: false,
        autoExecuted: false,
        itemCount: 0,
        summary: detection.summary || 'Aucun élément détecté — aucune proposition.',
      };
    }

    const drafts = draftsFromDetection(kind, detection);
    const proposalJson = {
      drafts,
      itemCount: drafts.length,
      summary: detection.summary,
      requiresConfirmation: true,
    };

    let run: AiAutomationRun;
    if (existing && (existing.status === AiAutomationRunStatus.CANCELLED || existing.status === AiAutomationRunStatus.FAILED)) {
      run = await this.prisma.aiAutomationRun.update({
        where: { id: existing.id },
        data: {
          ruleId: ruleId ?? existing.ruleId,
          status: AiAutomationRunStatus.PROPOSED,
          detectionJson: detection as unknown as Prisma.InputJsonValue,
          proposalJson: proposalJson as unknown as Prisma.InputJsonValue,
          resultJson: Prisma.DbNull,
          error: null,
          proposedById: userId,
          approvedById: null,
          executedAt: null,
        },
      });
    } else {
      run = await this.prisma.aiAutomationRun.create({
        data: {
          organizationId,
          ruleId: ruleId ?? null,
          kind,
          status: AiAutomationRunStatus.PROPOSED,
          idempotencyKey,
          detectionJson: detection as unknown as Prisma.InputJsonValue,
          proposalJson: proposalJson as unknown as Prisma.InputJsonValue,
          proposedById: userId,
        },
      });
    }

    const pending = await createPendingAction({
      organizationId,
      userId,
      type: 'APPROVE_AUTOMATION_RUN',
      payload: {
        runId: run.id,
        kind,
        itemCount: drafts.length,
        summary: detection.summary,
      },
    });

    let autoExecuted = false;
    if (input.allowAutoExecute && input.role) {
      const rule = ruleId
        ? await this.prisma.aiAutomationRule.findFirst({
            where: { id: ruleId, organizationId },
          })
        : await this.prisma.aiAutomationRule.findFirst({
            where: { organizationId, kind, enabled: true, autoExecute: true },
          });
      if (rule?.enabled && rule.autoExecute === true) {
        const executed = await this.approveAndExecute(run.id, organizationId, userId, input.role);
        autoExecuted = true;
        return {
          run: executed.run,
          pendingAction: null,
          duplicate: false,
          skippedDuplicate: false,
          autoExecuted: true,
          itemCount: drafts.length,
          summary: executed.reply,
        };
      }
    }

    return {
      run,
      pendingAction: pending,
      duplicate: false,
      skippedDuplicate: false,
      autoExecuted,
      itemCount: drafts.length,
      summary: `${detection.summary} Confirmation requise avant exécution (autoExecute=false par défaut).`,
    };
  }

  /**
   * High-level: detect + propose for a kind (used by AI tools).
   * Never silent-sends unless an enabled rule has autoExecute=true.
   */
  async detectAndPropose(input: {
    organizationId: string;
    userId: string;
    role: UserRole;
    kind: AiAutomationKind;
    config?: AutomationRuleConfig;
    ruleId?: string;
  }): Promise<ProposeAutomationResult> {
    const detection = await this.detect(input.kind, input.organizationId, input.config);
    return this.propose({
      organizationId: input.organizationId,
      userId: input.userId,
      kind: input.kind,
      detection,
      ruleId: input.ruleId,
      allowAutoExecute: true,
      role: input.role,
    });
  }

  async approveAndExecute(
    runId: string,
    organizationId: string,
    userId: string,
    role: UserRole,
  ): Promise<{ run: AiAutomationRun; reply: string }> {
    const run = await this.prisma.aiAutomationRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run) throw new NotFoundError('Automatisation introuvable');
    if (run.status === AiAutomationRunStatus.CANCELLED) {
      throw new ValidationError('Automatisation annulée');
    }
    if (
      run.status === AiAutomationRunStatus.SUCCEEDED ||
      run.status === AiAutomationRunStatus.PARTIAL
    ) {
      return {
        run,
        reply: this.formatExecuteReply(run, 'already_done'),
      };
    }

    // Permissions at LAST moment
    const needsSend =
      run.kind === AiAutomationKind.OUTSTANDING_REMINDER ||
      this.proposalNeedsSend(run.proposalJson);
    const needsTask =
      run.kind === AiAutomationKind.MAINTENANCE_ASSIGN_TASK ||
      this.proposalNeedsTask(run.proposalJson);
    const needsReminder =
      run.kind === AiAutomationKind.LEASE_EXPIRY_REMINDER ||
      this.proposalNeedsReminder(run.proposalJson);

    if (needsSend) {
      await this.rbac.assertPermission(role, 'MESSAGE_SEND');
    }
    if (needsTask) {
      const canTask = await this.rbac.hasPermission(role, 'TASK_CREATE');
      if (!canTask) {
        // Fallback: OWNER / staff with AI_USE may create via NotificationCenter
        const normalized = normalizeRole(role);
        const canAi = await this.rbac.hasPermission(role, 'AI_USE');
        if (!(canAi && (normalized === UserRole.OWNER || normalized === UserRole.ORG_ADMIN || normalized === UserRole.MANAGER))) {
          throw new ForbiddenError('Permission refusée (TASK_CREATE)');
        }
      }
    }
    if (needsReminder) {
      const canRem = await this.rbac.hasPermission(role, 'REMINDER_SEND');
      if (!canRem) {
        await this.rbac.assertPermission(role, 'MESSAGE_SEND');
      }
    }

    await this.prisma.aiAutomationRun.update({
      where: { id: run.id },
      data: {
        status: AiAutomationRunStatus.EXECUTING,
        approvedById: userId,
      },
    });

    try {
      const result = await this.executeRun(run, userId);
      const status =
        result.failed === 0 && result.succeeded > 0
          ? AiAutomationRunStatus.SUCCEEDED
          : result.succeeded > 0
            ? AiAutomationRunStatus.PARTIAL
            : AiAutomationRunStatus.FAILED;

      const updated = await this.prisma.aiAutomationRun.update({
        where: { id: run.id },
        data: {
          status,
          resultJson: result as unknown as Prisma.InputJsonValue,
          executedAt: new Date(),
          error: result.failed > 0 && result.succeeded === 0 ? result.errors.slice(0, 3).join(' | ') : null,
        },
      });

      await this.audit.log({
        organizationId,
        userId,
        userRole: role,
        action: AuditAction.AUTOMATION_JOB_RUN,
        resourceType: 'AiAutomationRun',
        resourceId: run.id,
        newValue: {
          kind: run.kind,
          status,
          succeeded: result.succeeded,
          failed: result.failed,
          evidenceIds: result.evidenceIds,
        },
        success: status !== AiAutomationRunStatus.FAILED,
        errorMessage: updated.error,
      });

      return { run: updated, reply: this.formatExecuteReply(updated, 'executed') };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Exécution impossible';
      const updated = await this.prisma.aiAutomationRun.update({
        where: { id: run.id },
        data: {
          status: AiAutomationRunStatus.FAILED,
          error: msg.slice(0, 2000),
          resultJson: { verified: false, error: msg } as Prisma.InputJsonValue,
          executedAt: new Date(),
        },
      });
      await this.audit.log({
        organizationId,
        userId,
        userRole: role,
        action: AuditAction.AUTOMATION_JOB_RUN,
        resourceType: 'AiAutomationRun',
        resourceId: run.id,
        success: false,
        errorMessage: msg,
      });
      if (err instanceof ForbiddenError) throw err;
      return { run: updated, reply: `Automatisation échouée : ${msg}` };
    }
  }

  async cancel(
    runId: string,
    organizationId: string,
    userId: string,
  ): Promise<AiAutomationRun> {
    const run = await this.prisma.aiAutomationRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run) throw new NotFoundError('Automatisation introuvable');
    if (
      run.status === AiAutomationRunStatus.SUCCEEDED ||
      run.status === AiAutomationRunStatus.EXECUTING
    ) {
      throw new ValidationError('Impossible d’annuler une automatisation déjà exécutée / en cours');
    }
    return this.prisma.aiAutomationRun.update({
      where: { id: run.id },
      data: {
        status: AiAutomationRunStatus.CANCELLED,
        resultJson: { cancelledById: userId, at: new Date().toISOString() },
      },
    });
  }

  async listRules(organizationId: string): Promise<AiAutomationRule[]> {
    return this.prisma.aiAutomationRule.findMany({
      where: { organizationId },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async listRuns(
    organizationId: string,
    opts?: { kind?: AiAutomationKind; limit?: number },
  ): Promise<AiAutomationRun[]> {
    const take = Math.max(1, Math.min(50, opts?.limit ?? 20));
    return this.prisma.aiAutomationRun.findMany({
      where: {
        organizationId,
        ...(opts?.kind ? { kind: opts.kind } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async upsertRule(input: {
    organizationId: string;
    userId: string;
    role: UserRole;
    kind: AiAutomationKind;
    name: string;
    enabled?: boolean;
    autoExecute?: boolean;
    config?: AutomationRuleConfig;
  }): Promise<AiAutomationRule> {
    const normalized = normalizeRole(input.role);
    if (input.autoExecute === true) {
      if (normalized !== UserRole.OWNER && normalized !== UserRole.ORG_ADMIN) {
        throw new ForbiddenError('Seul le OWNER peut activer autoExecute=true');
      }
    }

    return this.prisma.aiAutomationRule.upsert({
      where: {
        organizationId_kind_name: {
          organizationId: input.organizationId,
          kind: input.kind,
          name: input.name,
        },
      },
      create: {
        organizationId: input.organizationId,
        kind: input.kind,
        name: input.name,
        enabled: input.enabled === true,
        autoExecute: input.autoExecute === true,
        config: (input.config ?? {}) as Prisma.InputJsonValue,
        createdById: input.userId,
      },
      update: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.autoExecute !== undefined ? { autoExecute: input.autoExecute === true } : {}),
        ...(input.config !== undefined
          ? { config: input.config as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  // ── Detection helpers ──────────────────────────────────────────────────────

  private async detectOutstanding(
    organizationId: string,
    maxItems: number,
    preferredChannel?: AutomationChannel,
  ): Promise<DetectionFinding> {
    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.LATE] },
      },
      take: 80,
      orderBy: { dueDate: 'asc' },
      include: {
        lease: {
          include: {
            tenant: { select: { id: true, firstName: true, lastName: true, userId: true, phone: true } },
          },
        },
      },
    });

    const byTenant = new Map<
      string,
      {
        tenantId: string;
        tenantName: string;
        remainingXaf: number;
        period: string;
        paymentIds: string[];
        userId: string | null;
        phone: string | null;
      }
    >();

    for (const p of rows) {
      const rem = Math.max(0, decimalToNumber(p.amount) - decimalToNumber(p.amountPaid));
      if (rem <= 0) continue;
      const t = p.lease.tenant;
      const prev = byTenant.get(t.id);
      const period = `${p.periodMonth}/${p.periodYear}`;
      if (!prev) {
        byTenant.set(t.id, {
          tenantId: t.id,
          tenantName: `${t.firstName} ${t.lastName}`,
          remainingXaf: rem,
          period,
          paymentIds: [p.id],
          userId: t.userId,
          phone: t.phone,
        });
      } else {
        prev.remainingXaf += rem;
        prev.paymentIds.push(p.id);
      }
    }

    const drafts: BatchTenantReminderItem[] = [];
    for (const t of byTenant.values()) {
      if (drafts.length >= maxItems) break;
      const body = buildReminderBody({
        name: t.tenantName,
        amountXaf: t.remainingXaf,
        period: t.period,
      });
      const subject = `Relance loyer — ${t.period}`;

      const preferWa = preferredChannel === 'WHATSAPP';
      if (!preferWa && t.userId) {
        drafts.push({
          tenantId: t.tenantId,
          tenantName: t.tenantName,
          recipientUserId: t.userId,
          body,
          subject,
          channel: 'IN_APP',
        });
        continue;
      }
      if ((preferWa || !t.userId) && isWhatsAppConfigured && t.phone) {
        const toPhone = normalizePhoneE164(t.phone, env.WHATSAPP_DEFAULT_COUNTRY_CODE);
        if (toPhone && isValidWhatsAppPhone(toPhone)) {
          drafts.push({
            tenantId: t.tenantId,
            tenantName: t.tenantName,
            toPhone,
            recipientUserId: t.userId ?? undefined,
            body,
            subject,
            channel: 'WHATSAPP',
          });
          continue;
        }
      }
      if (t.userId) {
        drafts.push({
          tenantId: t.tenantId,
          tenantName: t.tenantName,
          recipientUserId: t.userId,
          body,
          subject,
          channel: 'IN_APP',
        });
      }
    }

    const day = utcDateKey();
    const stableKey = `outstanding-reminder:${day}`;

    return {
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      idempotencyKey: stableKey,
      itemCount: drafts.length,
      summary:
        drafts.length === 0
          ? 'Aucun impayé exploitable pour une relance automatisée.'
          : `${drafts.length} relance(s) impayés préparée(s) (brouillon — non envoyé).`,
      items: drafts.map((d) => ({
        ...d,
        paymentIds: byTenant.get(d.tenantId)?.paymentIds ?? [],
        remainingXaf: byTenant.get(d.tenantId)?.remainingXaf ?? 0,
      })),
    };
  }

  private async detectLeaseExpiry(
    organizationId: string,
    daysBeforeExpiry: number,
    maxItems: number,
  ): Promise<DetectionFinding> {
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + daysBeforeExpiry);

    const leases = await this.prisma.lease.findMany({
      where: {
        organizationId,
        status: LeaseStatus.ACTIVE,
        endDate: { gte: start, lte: end },
      },
      take: maxItems,
      orderBy: { endDate: 'asc' },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, userId: true } },
        apartment: { select: { id: true, label: true } },
      },
    });

    const day = utcDateKey();
    const items = leases.map((l) => {
      const tenantName = `${l.tenant.firstName} ${l.tenant.lastName}`;
      const endDate = l.endDate.toISOString().slice(0, 10);
      return {
        leaseId: l.id,
        tenantId: l.tenant.id,
        tenantName,
        apartmentId: l.apartment.id,
        apartmentLabel: l.apartment.label,
        endDate,
        targetUserId: l.tenant.userId ?? undefined,
        title: `Échéance bail — ${tenantName}`,
        message: `Le bail de ${tenantName} (${l.apartment.label}) se termine le ${endDate}.`,
        perItemKey: `lease-expiry:${l.id}:${endDate}`,
      };
    });

    return {
      kind: AiAutomationKind.LEASE_EXPIRY_REMINDER,
      idempotencyKey: `lease-expiry-batch:${day}`,
      itemCount: items.length,
      summary:
        items.length === 0
          ? `Aucun bail ACTIVE n’expire dans les ${daysBeforeExpiry} prochains jours.`
          : `${items.length} bail(aux) à échéance ≤ ${daysBeforeExpiry} j — rappels proposés.`,
      items,
    };
  }

  private async detectOpenMaintenance(
    organizationId: string,
    maxItems: number,
  ): Promise<DetectionFinding> {
    const tickets = await this.prisma.maintenanceTicket.findMany({
      where: {
        organizationId,
        status: { in: [MaintenanceTicketStatus.OPEN, MaintenanceTicketStatus.ASSIGNED] },
      },
      take: maxItems,
      orderBy: { createdAt: 'asc' },
      include: {
        apartment: { select: { label: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const day = utcDateKey();
    const items = tickets.map((t) => ({
      ticketId: t.id,
      title: `Maintenance : ${t.title}`,
      description: `Ticket ${t.id} — ${t.apartment.label} — priorité ${t.priority}${
        t.assignedTo ? ` — agent ${t.assignedTo.firstName} ${t.assignedTo.lastName}` : ' — non assigné'
      }`,
      assignedToId: t.assignedToId ?? undefined,
      apartmentLabel: t.apartment.label,
      priority: t.priority,
      status: t.status,
      perItemKey: `maint-task:${t.id}`,
    }));

    return {
      kind: AiAutomationKind.MAINTENANCE_ASSIGN_TASK,
      idempotencyKey: `maint-tasks-batch:${day}`,
      itemCount: items.length,
      summary:
        items.length === 0
          ? 'Aucun ticket OPEN/ASSIGNED — aucune tâche proposée.'
          : `${items.length} ticket(s) ouverts — tâches StaffTask proposées.`,
      items,
    };
  }

  private async detectAnomalies(
    organizationId: string,
    maxItems: number,
  ): Promise<DetectionFinding> {
    const urgent = await this.analytics.topUrgentIssues(organizationId, maxItems);
    const day = utcDateKey();
    const items = urgent.items.map((issue) => {
      const entityId =
        issue.entityIds.paymentId ||
        issue.entityIds.leaseId ||
        issue.entityIds.apartmentId ||
        issue.entityIds.tenantId ||
        issue.type;
      let proposedAction: 'NAVIGATE' | 'CREATE_STAFF_TASK' | 'CREATE_REMINDER' = 'NAVIGATE';
      let route = '/dashboard';
      if (issue.type === 'LATE_PAYMENT' || issue.type === 'PENDING_PAST_DUE') {
        proposedAction = 'CREATE_REMINDER';
        route = '/payments?tab=unpaid';
      } else if (issue.type === 'HIGH_MAINTENANCE' || String(issue.type).includes('MAINTENANCE')) {
        proposedAction = 'CREATE_STAFF_TASK';
        route = '/maintenance';
      } else if (String(issue.type).includes('LEASE') || String(issue.type).includes('EXPIR')) {
        proposedAction = 'CREATE_REMINDER';
        route = '/leases';
      } else if (String(issue.type).includes('VACANT')) {
        route = '/apartments';
      }

      return {
        issueType: issue.type,
        label: issue.label,
        severity: issue.severity,
        why: issue.why,
        entityIds: issue.entityIds,
        proposedAction,
        route,
        title: `Anomalie : ${issue.label}`,
        message: issue.why,
        perItemKey: `anomaly:${issue.type}:${entityId}:${day}`,
      };
    });

    return {
      kind: AiAutomationKind.ANOMALY_ACTION,
      idempotencyKey: `anomaly-batch:${day}`,
      itemCount: items.length,
      summary:
        items.length === 0
          ? 'Aucune anomalie urgente détectée — aucune action proposée.'
          : `${items.length} anomalie(s) — actions proposées (pas de correctif inventé).`,
      items,
    };
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  private proposalNeedsSend(proposalJson: unknown): boolean {
    const drafts = this.readDrafts(proposalJson);
    return drafts.some((d) => d.action === 'SEND_REMINDER');
  }

  private proposalNeedsTask(proposalJson: unknown): boolean {
    const drafts = this.readDrafts(proposalJson);
    return drafts.some((d) => d.action === 'CREATE_STAFF_TASK');
  }

  private proposalNeedsReminder(proposalJson: unknown): boolean {
    const drafts = this.readDrafts(proposalJson);
    return drafts.some((d) => d.action === 'CREATE_REMINDER');
  }

  private readDrafts(proposalJson: unknown): ProposalDraft[] {
    if (!proposalJson || typeof proposalJson !== 'object') return [];
    const drafts = (proposalJson as { drafts?: ProposalDraft[] }).drafts;
    return Array.isArray(drafts) ? drafts : [];
  }

  private async executeRun(
    run: AiAutomationRun,
    userId: string,
  ): Promise<{
    succeeded: number;
    failed: number;
    skipped: number;
    evidenceIds: string[];
    outcomes: Array<Record<string, unknown>>;
    errors: string[];
    verified: boolean;
  }> {
    const drafts = this.readDrafts(run.proposalJson);
    const outcomes: Array<Record<string, unknown>> = [];
    const evidenceIds: string[] = [];
    const errors: string[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const draft of drafts) {
      try {
        if (draft.action === 'SEND_REMINDER') {
          const item = draft.payload as unknown as BatchTenantReminderItem & {
            paymentIds?: string[];
          };
          if (!item.tenantId || !item.body || !item.channel) {
            failed += 1;
            errors.push(`${item.tenantName ?? '?'}: données incomplètes`);
            outcomes.push({ action: draft.action, ok: false, error: 'incomplete' });
            continue;
          }
          if (item.channel === 'IN_APP') {
            if (!item.recipientUserId) {
              failed += 1;
              errors.push(`${item.tenantName}: recipientUserId manquant`);
              outcomes.push({ action: draft.action, ok: false, error: 'no_recipient' });
              continue;
            }
            const message = await this.notificationCenter.sendMessage(run.organizationId, userId, {
              recipientId: item.recipientUserId,
              subject: item.subject,
              body: item.body,
            });
            // Verify
            const verified = await this.prisma.message.findFirst({
              where: { id: message.id, organizationId: run.organizationId },
              select: { id: true },
            });
            if (!verified) {
              failed += 1;
              errors.push(`${item.tenantName}: message non vérifié en DB`);
              outcomes.push({ action: draft.action, ok: false, error: 'verify_failed' });
              continue;
            }
            evidenceIds.push(message.id);
            succeeded += 1;
            outcomes.push({
              action: draft.action,
              ok: true,
              channel: 'IN_APP',
              messageId: message.id,
              tenantId: item.tenantId,
            });
          } else if (item.channel === 'WHATSAPP') {
            if (!item.toPhone) {
              failed += 1;
              errors.push(`${item.tenantName}: toPhone manquant`);
              outcomes.push({ action: draft.action, ok: false, error: 'no_phone' });
              continue;
            }
            const { message, providerMessageId } = await this.notificationCenter.sendWhatsAppMessage(
              run.organizationId,
              userId,
              {
                tenantId: item.tenantId,
                toPhone: item.toPhone,
                body: item.body,
                subject: item.subject,
                recipientUserId: item.recipientUserId,
              },
            );
            const messageId =
              message && typeof message === 'object' && 'id' in message
                ? String((message as { id: string }).id)
                : undefined;
            if (!messageId && !providerMessageId) {
              failed += 1;
              errors.push(`${item.tenantName}: envoi WhatsApp sans id vérifiable`);
              outcomes.push({ action: draft.action, ok: false, error: 'no_evidence' });
              continue;
            }
            if (messageId) evidenceIds.push(messageId);
            if (providerMessageId) evidenceIds.push(providerMessageId);
            succeeded += 1;
            outcomes.push({
              action: draft.action,
              ok: true,
              channel: 'WHATSAPP',
              messageId,
              providerMessageId,
              tenantId: item.tenantId,
            });
          } else {
            failed += 1;
            errors.push(`${item.tenantName}: canal non supporté`);
            outcomes.push({ action: draft.action, ok: false, error: 'bad_channel' });
          }
        } else if (draft.action === 'CREATE_REMINDER') {
          const p = draft.payload;
          const title = String(p.title ?? draft.summary);
          const message = String(p.message ?? draft.summary);
          const scheduledAt =
            typeof p.endDate === 'string'
              ? new Date(p.endDate).toISOString()
              : new Date().toISOString();
          const reminder = await this.notificationCenter.createReminder(run.organizationId, {
            type: run.kind === AiAutomationKind.LEASE_EXPIRY_REMINDER ? 'LEASE_EXPIRY' : 'ANOMALY',
            title,
            message,
            targetUserId: typeof p.targetUserId === 'string' ? p.targetUserId : undefined,
            relatedType: typeof p.leaseId === 'string' ? 'Lease' : typeof p.issueType === 'string' ? 'Anomaly' : undefined,
            relatedId:
              typeof p.leaseId === 'string'
                ? p.leaseId
                : typeof p.entityIds === 'object' && p.entityIds && 'paymentId' in (p.entityIds as object)
                  ? String((p.entityIds as { paymentId?: string }).paymentId ?? '')
                  : undefined,
            scheduledAt,
          });
          const verified = await this.prisma.reminder.findFirst({
            where: { id: reminder.id, organizationId: run.organizationId },
            select: { id: true },
          });
          if (!verified) {
            failed += 1;
            errors.push(`${title}: rappel non vérifié`);
            outcomes.push({ action: draft.action, ok: false, error: 'verify_failed' });
            continue;
          }
          evidenceIds.push(reminder.id);
          succeeded += 1;
          outcomes.push({ action: draft.action, ok: true, reminderId: reminder.id });
        } else if (draft.action === 'CREATE_STAFF_TASK') {
          const p = draft.payload;
          const title = String(p.title ?? draft.summary).slice(0, 200);
          const description =
            typeof p.description === 'string'
              ? p.description
              : typeof p.why === 'string'
                ? p.why
                : undefined;
          const task = await this.notificationCenter.createTask(run.organizationId, userId, {
            title,
            description,
            assignedToId: typeof p.assignedToId === 'string' ? p.assignedToId : undefined,
          });
          const verified = await this.prisma.staffTask.findFirst({
            where: { id: task.id, organizationId: run.organizationId },
            select: { id: true },
          });
          if (!verified) {
            failed += 1;
            errors.push(`${title}: tâche non vérifiée`);
            outcomes.push({ action: draft.action, ok: false, error: 'verify_failed' });
            continue;
          }
          evidenceIds.push(task.id);
          succeeded += 1;
          outcomes.push({
            action: draft.action,
            ok: true,
            taskId: task.id,
            ticketId: p.ticketId,
          });
        } else if (draft.action === 'NAVIGATE') {
          skipped += 1;
          outcomes.push({
            action: 'NAVIGATE',
            ok: true,
            route: draft.payload.route ?? '/dashboard',
            note: 'Action de navigation proposée — pas d’envoi silencieux',
          });
        } else {
          skipped += 1;
          outcomes.push({ action: draft.action, ok: true, skipped: true });
        }
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : 'erreur';
        errors.push(msg);
        outcomes.push({ action: draft.action, ok: false, error: msg });
      }
    }

    return {
      succeeded,
      failed,
      skipped,
      evidenceIds,
      outcomes,
      errors,
      verified: evidenceIds.length > 0 || (succeeded === 0 && failed === 0 && skipped > 0),
    };
  }

  private formatExecuteReply(
    run: AiAutomationRun,
    mode: 'executed' | 'already_done',
  ): string {
    const result = (run.resultJson ?? {}) as {
      succeeded?: number;
      failed?: number;
      skipped?: number;
      evidenceIds?: string[];
      outcomes?: Array<Record<string, unknown>>;
    };
    const ids = Array.isArray(result.evidenceIds) ? result.evidenceIds : [];
    const lines: string[] = [];
    if (mode === 'already_done') {
      lines.push(`Automatisation déjà exécutée (statut ${run.status}, run ${run.id}).`);
    } else {
      lines.push(
        `Automatisation ${run.kind} : statut ${run.status}` +
          ` — ${result.succeeded ?? 0} ok, ${result.failed ?? 0} échec(s), ${result.skipped ?? 0} ignoré(s).`,
      );
    }
    if (ids.length) {
      lines.push(`Preuves (ids) : ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? '…' : ''}`);
    } else if ((result.succeeded ?? 0) > 0) {
      lines.push('Attention : succès déclaré sans ids de preuve — vérifier les journaux.');
    } else if (run.status === AiAutomationRunStatus.FAILED) {
      lines.push(run.error ? `Erreur : ${run.error}` : 'Échec sans preuve d’exécution.');
    } else if ((result.skipped ?? 0) > 0 && (result.succeeded ?? 0) === 0) {
      lines.push('Uniquement des navigations / no-op — aucun envoi effectué.');
    }
    return lines.join('\n');
  }

  private async ensurePendingForRun(
    run: AiAutomationRun,
    organizationId: string,
    userId: string,
  ): Promise<PendingAction | null> {
    if (run.status !== AiAutomationRunStatus.PROPOSED && run.status !== AiAutomationRunStatus.APPROVED) {
      return null;
    }
    const proposal = run.proposalJson as { itemCount?: number; summary?: string } | null;
    return createPendingAction({
      organizationId,
      userId,
      type: 'APPROVE_AUTOMATION_RUN',
      payload: {
        runId: run.id,
        kind: run.kind,
        itemCount: proposal?.itemCount ?? 0,
        summary: proposal?.summary ?? `Automatisation ${run.kind}`,
      },
    });
  }
}
