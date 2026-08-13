import {
  AiAutomationKind,
  AiAutomationRunStatus,
  UserRole,
} from '@prisma/client';
import { AiAutomationService } from '../../src/modules/ai/ai.automation.service.js';
import { ForbiddenError } from '../../src/shared/errors/app.error.js';
import { _resetPendingActionsForTests } from '../../src/modules/ai/ai.pending-actions.js';

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function mockRbac(opts?: { denyMessageSend?: boolean; denyTask?: boolean }) {
  return {
    assertPermission: jest.fn(async (_role: string, permission: string) => {
      if (opts?.denyMessageSend && permission === 'MESSAGE_SEND') {
        throw new ForbiddenError('Permission refusée');
      }
      if (opts?.denyTask && permission === 'TASK_CREATE') {
        throw new ForbiddenError('Permission refusée');
      }
    }),
    hasPermission: jest.fn(async (_role: string, permission: string) => {
      if (opts?.denyMessageSend && permission === 'MESSAGE_SEND') return false;
      if (opts?.denyTask && permission === 'TASK_CREATE') return false;
      return true;
    }),
  };
}

function mockAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function mockNotificationCenter() {
  return {
    sendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    sendWhatsAppMessage: jest.fn().mockResolvedValue({
      message: { id: 'wa-1' },
      providerMessageId: 'wamid-1',
    }),
    createReminder: jest.fn().mockResolvedValue({ id: 'rem-1' }),
    createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
  };
}

function mockAnalytics() {
  return {
    topUrgentIssues: jest.fn().mockResolvedValue({ asOf: new Date().toISOString(), limit: 5, items: [] }),
  };
}

describe('AiAutomationService', () => {
  beforeEach(() => {
    _resetPendingActionsForTests();
  });

  it('detect outstanding empty → no proposal items', async () => {
    const prisma = {
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      aiAutomationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const nc = mockNotificationCenter();
    const svc = new AiAutomationService(
      prisma as never,
      nc as never,
      mockAnalytics() as never,
      mockRbac() as never,
      mockAudit() as never,
    );
    const detection = await svc.detect(AiAutomationKind.OUTSTANDING_REMINDER, 'org1');
    expect(detection.itemCount).toBe(0);
    expect(detection.items).toEqual([]);

    const proposed = await svc.propose({
      organizationId: 'org1',
      userId: 'user1',
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      detection,
    });
    expect(proposed.itemCount).toBe(0);
    expect(proposed.pendingAction).toBeNull();
    expect(proposed.run).toBeNull();
    expect(nc.sendMessage).not.toHaveBeenCalled();
    expect(prisma.aiAutomationRun.create).not.toHaveBeenCalled();
  });

  it('autoExecute false never sends without approve', async () => {
    const day = utcDay();
    const detection = {
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      idempotencyKey: `outstanding-reminder:${day}`,
      itemCount: 1,
      summary: '1 relance',
      items: [
        {
          tenantId: 't1',
          tenantName: 'Jean Test',
          recipientUserId: 'u-tenant',
          body: 'Relance test',
          subject: 'Relance',
          channel: 'IN_APP' as const,
        },
      ],
    };
    const createdRun = {
      id: 'run-1',
      organizationId: 'org1',
      ruleId: null,
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      status: AiAutomationRunStatus.PROPOSED,
      idempotencyKey: detection.idempotencyKey,
      detectionJson: detection,
      proposalJson: { drafts: [], itemCount: 1 },
      resultJson: null,
      error: null,
      proposedById: 'user1',
      approvedById: null,
      executedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      payment: { findMany: jest.fn() },
      aiAutomationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdRun),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      aiAutomationRule: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const nc = mockNotificationCenter();
    const svc = new AiAutomationService(
      prisma as never,
      nc as never,
      mockAnalytics() as never,
      mockRbac() as never,
      mockAudit() as never,
    );

    const proposed = await svc.propose({
      organizationId: 'org1',
      userId: 'user1',
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      detection,
      allowAutoExecute: true,
      role: UserRole.OWNER,
    });

    expect(proposed.pendingAction?.type).toBe('APPROVE_AUTOMATION_RUN');
    expect(proposed.autoExecuted).toBe(false);
    expect(nc.sendMessage).not.toHaveBeenCalled();
    expect(prisma.aiAutomationRun.create).toHaveBeenCalled();
    const createArg = prisma.aiAutomationRun.create.mock.calls[0][0];
    expect(createArg.data.status).toBe(AiAutomationRunStatus.PROPOSED);
  });

  it('idempotency returns same unfinished run (duplicate)', async () => {
    const day = utcDay();
    const key = `outstanding-reminder:${day}`;
    const existing = {
      id: 'run-existing',
      organizationId: 'org1',
      ruleId: null,
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      status: AiAutomationRunStatus.PROPOSED,
      idempotencyKey: key,
      detectionJson: {},
      proposalJson: { itemCount: 2, summary: 'existante' },
      resultJson: null,
      error: null,
      proposedById: 'user1',
      approvedById: null,
      executedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      aiAutomationRun: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const nc = mockNotificationCenter();
    const svc = new AiAutomationService(
      prisma as never,
      nc as never,
      mockAnalytics() as never,
      mockRbac() as never,
      mockAudit() as never,
    );

    const proposed = await svc.propose({
      organizationId: 'org1',
      userId: 'user1',
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      detection: {
        kind: AiAutomationKind.OUTSTANDING_REMINDER,
        idempotencyKey: key,
        itemCount: 2,
        summary: '2 relances',
        items: [{ tenantId: 't1' }, { tenantId: 't2' }],
      },
    });

    expect(proposed.duplicate).toBe(true);
    expect(proposed.skippedDuplicate).toBe(false);
    expect(proposed.run?.id).toBe('run-existing');
    expect(proposed.pendingAction?.payload.runId).toBe('run-existing');
    expect(prisma.aiAutomationRun.create).not.toHaveBeenCalled();
    expect(nc.sendMessage).not.toHaveBeenCalled();
  });

  it('idempotency returns SKIPPED_DUPLICATE when already succeeded', async () => {
    const day = utcDay();
    const key = `outstanding-reminder:${day}`;
    const existing = {
      id: 'run-done',
      organizationId: 'org1',
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      status: AiAutomationRunStatus.SUCCEEDED,
      idempotencyKey: key,
      proposalJson: { itemCount: 1 },
      detectionJson: {},
      resultJson: { evidenceIds: ['msg-1'] },
      ruleId: null,
      error: null,
      proposedById: 'user1',
      approvedById: 'user1',
      executedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      aiAutomationRun: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const svc = new AiAutomationService(
      prisma as never,
      mockNotificationCenter() as never,
      mockAnalytics() as never,
      mockRbac() as never,
      mockAudit() as never,
    );

    const proposed = await svc.propose({
      organizationId: 'org1',
      userId: 'user1',
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      detection: {
        kind: AiAutomationKind.OUTSTANDING_REMINDER,
        idempotencyKey: key,
        itemCount: 1,
        summary: '1',
        items: [{ tenantId: 't1' }],
      },
    });

    expect(proposed.skippedDuplicate).toBe(true);
    expect(proposed.pendingAction).toBeNull();
    expect(proposed.summary).toMatch(/anti-doublon|déjà trait/i);
  });

  it('permission denied on execute without MESSAGE_SEND', async () => {
    const run = {
      id: 'run-exec',
      organizationId: 'org1',
      kind: AiAutomationKind.OUTSTANDING_REMINDER,
      status: AiAutomationRunStatus.PROPOSED,
      idempotencyKey: `outstanding-reminder:${utcDay()}`,
      proposalJson: {
        drafts: [
          {
            action: 'SEND_REMINDER',
            summary: 'Relance',
            payload: {
              tenantId: 't1',
              tenantName: 'Jean',
              recipientUserId: 'u1',
              body: 'Hello',
              channel: 'IN_APP',
            },
          },
        ],
        itemCount: 1,
      },
      detectionJson: {},
      resultJson: null,
      ruleId: null,
      error: null,
      proposedById: 'user1',
      approvedById: null,
      executedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      aiAutomationRun: {
        findFirst: jest.fn().mockResolvedValue(run),
        update: jest.fn().mockResolvedValue({ ...run, status: AiAutomationRunStatus.FAILED }),
      },
    };
    const rbac = mockRbac({ denyMessageSend: true });
    const nc = mockNotificationCenter();
    const svc = new AiAutomationService(
      prisma as never,
      nc as never,
      mockAnalytics() as never,
      rbac as never,
      mockAudit() as never,
    );

    await expect(
      svc.approveAndExecute('run-exec', 'org1', 'user1', UserRole.TENANT),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(nc.sendMessage).not.toHaveBeenCalled();
  });

  it('upsertRule autoExecute=true requires OWNER', async () => {
    const prisma = {
      aiAutomationRule: { upsert: jest.fn() },
    };
    const svc = new AiAutomationService(
      prisma as never,
      mockNotificationCenter() as never,
      mockAnalytics() as never,
      mockRbac() as never,
      mockAudit() as never,
    );

    await expect(
      svc.upsertRule({
        organizationId: 'org1',
        userId: 'agent1',
        role: UserRole.AGENT,
        kind: AiAutomationKind.OUTSTANDING_REMINDER,
        name: 'default',
        autoExecute: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(prisma.aiAutomationRule.upsert).not.toHaveBeenCalled();
  });
});
