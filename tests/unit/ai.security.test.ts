import {
  AiMemoryKind,
  AiMemoryScope,
  AiMemorySource,
  UserRole,
} from '@prisma/client';
import { AiService } from '../../src/modules/ai/ai.service.js';
import { AiMemoryService } from '../../src/modules/ai/ai.memory.service.js';
import {
  _resetPendingActionsForTests,
  _setPendingActionsPrismaForTests,
  _createInMemoryPendingPrismaForTests,
  createPendingAction,
  getPendingAction,
} from '../../src/modules/ai/ai.pending-actions.js';
import { extractCuidPreferLabeled } from '../../src/modules/ai/ai.ids.js';
import { ForbiddenError, ValidationError } from '../../src/shared/errors/app.error.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { ORG_STAFF_ROLES } from '../../src/shared/auth/roles.js';

jest.mock('../../src/config/env.js', () => {
  const actual = jest.requireActual('../../src/config/env.js') as Record<string, unknown>;
  return {
    ...actual,
    isAiMemoryEnabled: true,
    isAiSecurityStrict: true,
    env: {
      ...(actual.env as Record<string, unknown>),
      AI_MEMORY_ENABLED: true,
      AI_SECURITY_STRICT: true,
      AI_PENDING_ACTION_TTL_MS: 60_000,
      AI_SESSION_TTL_HOURS: 24,
    },
  };
});

type MemRow = {
  id: string;
  organizationId: string;
  userId: string | null;
  scope: AiMemoryScope;
  kind: AiMemoryKind;
  key: string | null;
  content: string;
  source: AiMemorySource;
  createdById: string;
  updatedById: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createMemoryStore() {
  const rows: MemRow[] = [];
  let seq = 0;
  return {
    rows,
    aiMemoryEntry: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          rows.find((r) => {
            if (where.id && r.id !== where.id) return false;
            if (where.organizationId && r.organizationId !== where.organizationId) return false;
            if (where.scope && r.scope !== where.scope) return false;
            if ('userId' in where && r.userId !== where.userId) return false;
            if (where.key && r.key !== where.key) return false;
            return true;
          }) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const orgId = where.organizationId as string;
        const and = (where.AND as Array<Record<string, unknown>>) ?? [];
        const scopeOr = (and.find(
          (c) => Array.isArray(c.OR) && (c.OR as unknown[]).some((x) => (x as { scope?: string }).scope),
        )?.OR ?? []) as Array<{ scope?: AiMemoryScope; userId?: string | null }>;
        return rows.filter((r) => {
          if (r.organizationId !== orgId) return false;
          if (r.expiresAt != null && r.expiresAt.getTime() <= Date.now()) return false;
          if (!scopeOr.length) return true;
          return scopeOr.some((c) => {
            if (c.scope === AiMemoryScope.USER) {
              return r.scope === AiMemoryScope.USER && r.userId === c.userId;
            }
            if (c.scope === AiMemoryScope.ORGANIZATION) {
              return r.scope === AiMemoryScope.ORGANIZATION && r.userId == null;
            }
            return false;
          });
        });
      }),
      create: jest.fn(async ({ data }: { data: Partial<MemRow> }) => {
        const now = new Date();
        const row: MemRow = {
          id: `mem_${++seq}`,
          organizationId: data.organizationId!,
          userId: data.userId ?? null,
          scope: data.scope!,
          kind: data.kind ?? AiMemoryKind.FACT,
          key: data.key ?? null,
          content: data.content!,
          source: data.source ?? AiMemorySource.EXPLICIT,
          createdById: data.createdById!,
          updatedById: data.updatedById ?? null,
          expiresAt: data.expiresAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return row;
      }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    aiSessionContext: { upsert: jest.fn(), findUnique: jest.fn() },
  };
}

function buildAiServiceForConfirm(opts?: { denyMessageSend?: boolean }) {
  const rbac = {
    hasPermission: jest.fn(async (_role: string, permission: string) => {
      if (opts?.denyMessageSend && permission === 'MESSAGE_SEND') return false;
      return true;
    }),
    assertPermission: jest.fn(async (_role: string, permission: string) => {
      if (opts?.denyMessageSend && permission === 'MESSAGE_SEND') {
        throw new ForbiddenError(`Permission refusée (${permission})`);
      }
    }),
  };
  const subscriptionService = {
    resolveAccessContext: jest.fn().mockResolvedValue({
      hasFeature: () => true,
      plan: 'PRO',
    }),
  };
  const openai = {
    isAvailable: () => false,
    isSttAvailable: () => false,
    isTtsAvailable: () => false,
  };
  const service = new AiService(
    openai as never,
    {} as never,
    subscriptionService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never, // documentsIntel (Phase J4)
    {} as never,
    {} as never,
    rbac as never,
  );
  return { service, rbac };
}

describe('Phase I — AI security', () => {
  beforeEach(async () => {
    _setPendingActionsPrismaForTests(null);
    await _resetPendingActionsForTests();
  });

  afterEach(() => {
    _setPendingActionsPrismaForTests(null);
  });

  it('confirm SEND without MESSAGE_SEND → ForbiddenError clear message', async () => {
    const pending = await createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'SEND_TENANT_MESSAGE',
      payload: {
        recipientUserId: 'u2',
        body: 'Hello',
        tenantName: 'Jean',
      },
    });
    const { service } = buildAiServiceForConfirm({ denyMessageSend: true });

    await expect(
      service.confirmAction('org1', 'user1', UserRole.ACCOUNTANT, pending.id),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      service.confirmAction('org1', 'user1', UserRole.ACCOUNTANT, pending.id),
    ).rejects.toMatchObject({
      message: expect.stringContaining('MESSAGE_SEND'),
    });

    // Pending must still exist after forbidden (not consumed)
    const still = await getPendingAction(pending.id, 'org1', 'user1');
    expect(still.type).toBe('SEND_TENANT_MESSAGE');
  });

  it('pending action wrong org → error', async () => {
    const action = await createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'GENERATE_LEASE_PDF',
      payload: { leaseId: 'lease1' },
    });
    await expect(getPendingAction(action.id, 'org2', 'user1')).rejects.toBeInstanceOf(ValidationError);
    await expect(getPendingAction(action.id, 'org2', 'user1')).rejects.toThrow(/organisation/i);
  });

  it('pending action wrong user → error', async () => {
    const action = await createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'GENERATE_LEASE_PDF',
      payload: { leaseId: 'lease1' },
    });
    await expect(getPendingAction(action.id, 'org1', 'user2')).rejects.toBeInstanceOf(ValidationError);
    await expect(getPendingAction(action.id, 'org1', 'user2')).rejects.toThrow(/utilisateur/i);
  });

  it('Prisma-backed pending store (mock) isolates org/user', async () => {
    const mock = _createInMemoryPendingPrismaForTests();
    _setPendingActionsPrismaForTests(mock);
    const a = await createPendingAction({
      organizationId: 'orgA',
      userId: 'uA',
      type: 'CREATE_LEASE',
      payload: { tenantId: 't1', apartmentId: 'a1' },
    });
    await expect(getPendingAction(a.id, 'orgB', 'uA')).rejects.toThrow(/organisation/i);
    await expect(getPendingAction(a.id, 'orgA', 'uB')).rejects.toThrow(/utilisateur/i);
    const ok = await getPendingAction(a.id, 'orgA', 'uA');
    expect(ok.type).toBe('CREATE_LEASE');
  });

  it('memory USER isolation (reuse pattern)', async () => {
    const store = createMemoryStore();
    const service = new AiMemoryService(store as unknown as PrismaService);

    await service.remember({
      organizationId: 'org1',
      userId: 'userA',
      role: UserRole.MANAGER,
      scope: AiMemoryScope.USER,
      content: 'couleur preferee bleu',
      key: 'pref_color',
    });
    await service.remember({
      organizationId: 'org1',
      userId: 'userB',
      role: UserRole.MANAGER,
      scope: AiMemoryScope.USER,
      content: 'couleur preferee rouge',
      key: 'pref_color',
    });

    const recalled = await service.recall({
      organizationId: 'org1',
      userId: 'userA',
      role: UserRole.MANAGER,
    });
    expect(recalled.some((m) => m.content.includes('bleu'))).toBe(true);
    expect(recalled.some((m) => m.content.includes('rouge'))).toBe(false);
  });

  it('memory does not leak across organizations', async () => {
    const store = createMemoryStore();
    const service = new AiMemoryService(store as unknown as PrismaService);

    await service.remember({
      organizationId: 'orgA',
      userId: 'user1',
      role: UserRole.OWNER,
      scope: AiMemoryScope.USER,
      content: 'secret org A',
      key: 'k',
    });

    const other = await service.recall({
      organizationId: 'orgB',
      userId: 'user1',
      role: UserRole.OWNER,
    });
    expect(other.some((m) => m.content.includes('secret org A'))).toBe(false);
  });

  it('extractCuid prefers labeled id when present', () => {
    const lease = 'cleaseaaaaaaaaaaaaaaaaaa';
    const payment = 'cpaymentbbbbbbbbbbbbbbb';
    const text = `Voir paymentId ${payment} et leaseId ${lease}`;
    expect(extractCuidPreferLabeled(text, 'leaseId')).toBe(lease);
    expect(extractCuidPreferLabeled(text, 'paymentId')).toBe(payment);
    // Without prefer: first labeled in order lease → payment
    expect(extractCuidPreferLabeled(text)).toBe(lease);
  });

  it('extractCuid bare fallback when no label', () => {
    const only = 'ccccc11111111111111111';
    expect(extractCuidPreferLabeled(`génère le contrat ${only}`)).toBe(only);
  });

  it('TENANT is not in orgStaffPipeline roles (route guard)', () => {
    expect(ORG_STAFF_ROLES).not.toContain(UserRole.TENANT);
    expect(ORG_STAFF_ROLES).toEqual(
      expect.arrayContaining([UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT]),
    );
  });
});
