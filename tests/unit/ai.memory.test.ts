import {
  AiMemoryKind,
  AiMemoryScope,
  AiMemorySource,
  UserRole,
} from '@prisma/client';
import { AiMemoryService } from '../../src/modules/ai/ai.memory.service.js';
import { ForbiddenError, ValidationError } from '../../src/shared/errors/app.error.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

jest.mock('../../src/config/env.js', () => {
  const actual = jest.requireActual('../../src/config/env.js') as Record<string, unknown>;
  return {
    ...actual,
    isAiMemoryEnabled: true,
    env: {
      ...(actual.env as Record<string, unknown>),
      AI_MEMORY_ENABLED: true,
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
            if (where.OR && Array.isArray(where.OR)) {
              const ok = (where.OR as Array<Record<string, unknown>>).some((clause) => {
                if (clause.scope && r.scope !== clause.scope) return false;
                if ('userId' in clause && r.userId !== clause.userId) return false;
                return true;
              });
              if (!ok) return false;
            }
            return true;
          }) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const orgId = where.organizationId as string;
        const and = (where.AND as Array<Record<string, unknown>>) ?? [];
        const scopeOr = (and.find((c) => Array.isArray(c.OR) && (c.OR as unknown[]).some((x) => (x as { scope?: string }).scope))
          ?.OR ?? []) as Array<{ scope?: AiMemoryScope; userId?: string | null }>;
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
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<MemRow> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        const [removed] = rows.splice(idx, 1);
        return removed;
      }),
    },
    aiSessionContext: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

describe('AiMemoryService', () => {
  it('isolation : user A ne rappelle pas la mémoire USER de user B', async () => {
    const store = createMemoryStore();
    const service = new AiMemoryService(store as unknown as PrismaService);

    await service.remember({
      organizationId: 'org1',
      userId: 'userA',
      role: UserRole.MANAGER,
      scope: AiMemoryScope.USER,
      content: 'secret de A',
      key: 'pref_a',
    });
    await service.remember({
      organizationId: 'org1',
      userId: 'userB',
      role: UserRole.MANAGER,
      scope: AiMemoryScope.USER,
      content: 'secret de B',
      key: 'pref_b',
    });

    const recalled = await service.recall({
      organizationId: 'org1',
      userId: 'userA',
      role: UserRole.MANAGER,
    });

    expect(recalled.some((m) => m.content.includes('secret de A'))).toBe(true);
    expect(recalled.some((m) => m.content.includes('secret de B'))).toBe(false);
  });

  it('écriture ORGANIZATION refusée pour non-owner', async () => {
    const store = createMemoryStore();
    const service = new AiMemoryService(store as unknown as PrismaService);

    await expect(
      service.remember({
        organizationId: 'org1',
        userId: 'mgr1',
        role: UserRole.MANAGER,
        scope: AiMemoryScope.ORGANIZATION,
        content: 'préférence org',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('remember + recall roundtrip (OWNER org + USER)', async () => {
    const store = createMemoryStore();
    const service = new AiMemoryService(store as unknown as PrismaService);

    await service.remember({
      organizationId: 'org1',
      userId: 'owner1',
      role: UserRole.OWNER,
      scope: AiMemoryScope.USER,
      content: 'Je préfère WhatsApp',
      key: 'preferred_reminder_channel',
      kind: AiMemoryKind.PREFERENCE,
    });
    await service.remember({
      organizationId: 'org1',
      userId: 'owner1',
      role: UserRole.OWNER,
      scope: AiMemoryScope.ORGANIZATION,
      content: 'Toujours confirmer avant envoi',
      key: 'org_confirm_policy',
    });

    const all = await service.recall({
      organizationId: 'org1',
      userId: 'owner1',
      role: UserRole.OWNER,
    });
    expect(all.length).toBe(2);
    expect(all.map((m) => m.key).sort()).toEqual([
      'org_confirm_policy',
      'preferred_reminder_channel',
    ]);

    const filtered = await service.recall({
      organizationId: 'org1',
      userId: 'owner1',
      role: UserRole.OWNER,
      query: 'whatsapp',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toMatch(/WhatsApp/i);
  });

  it('rejette contenu vide', async () => {
    const store = createMemoryStore();
    const service = new AiMemoryService(store as unknown as PrismaService);
    await expect(
      service.remember({
        organizationId: 'org1',
        userId: 'u1',
        role: UserRole.OWNER,
        scope: AiMemoryScope.USER,
        content: '   ',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
