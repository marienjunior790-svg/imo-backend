import { resolveRolePermissions, ROLE_PERMISSION_MATRIX } from '../../src/shared/rbac/role-matrix.js';
import { buildLocalFallbackReply } from '../../src/modules/ai/ai.fallback.js';
import type { AiOrganizationContext } from '../../src/modules/ai/ai.context.service.js';
import { parsePagination, buildPaginationMeta } from '../../src/shared/utils/pagination.js';
import { TtlCache } from '../../src/shared/utils/ttl-cache.js';

const sampleCtx = (): AiOrganizationContext => ({
  organization: { id: 'o1', name: 'Agence Test', city: 'Brazzaville', plan: 'PRO' },
  summary: {
    totalApartments: 10,
    availableApartments: 2,
    occupiedApartments: 8,
    activeLeases: 8,
    totalTenants: 8,
    latePayments: 1,
    pendingPayments: 2,
    collectedThisMonthXaf: 1_200_000,
  },
  latePayments: [
    {
      tenantName: 'Grace T.',
      apartmentLabel: 'A1',
      amountXaf: 150_000,
      dueDate: '2026-06-01',
      period: '6/2026',
    },
  ],
  availableApartments: [{ label: 'B2', rentXaf: 120_000 }],
  expiringLeases: [],
});

describe('RBAC role-matrix', () => {
  it('ORG_ADMIN a DASHBOARD_VIEW et AI_USE', () => {
    const keys = resolveRolePermissions('ORG_ADMIN');
    expect(keys).toContain('DASHBOARD_VIEW');
    expect(keys).toContain('AI_USE');
    expect(keys).toContain('AI_CHAT');
  });

  it('TENANT a le portail et AI_CHAT, pas BUILDING_CREATE', () => {
    const keys = resolveRolePermissions('TENANT');
    expect(keys).toContain('PORTAL_HOME_VIEW');
    expect(keys).toContain('AI_CHAT');
    expect(keys).not.toContain('BUILDING_CREATE');
  });

  it('AGENT a INSPECTION et TENANT_VIEW', () => {
    const keys = resolveRolePermissions('AGENT');
    expect(keys).toContain('INSPECTION_VIEW');
    expect(keys).toContain('TENANT_VIEW');
  });

  it('SUPER_ADMIN = ALL', () => {
    expect(ROLE_PERMISSION_MATRIX.SUPER_ADMIN).toBe('ALL');
  });
});

describe('AI local fallback', () => {
  it('répond sur les retards', () => {
    const reply = buildLocalFallbackReply('Quels loyers en retard ?', sampleCtx());
    expect(reply).toContain('Grace T.');
    expect(reply).toContain('150');
  });

  it('résumé par défaut', () => {
    const reply = buildLocalFallbackReply('Bonjour', sampleCtx());
    expect(reply).toContain('Agence Test');
    expect(reply).toContain('10 biens');
  });
});

describe('pagination', () => {
  it('parse page/limit avec bornes', () => {
    expect(parsePagination({ page: 0, limit: 500 })).toEqual({ page: 1, limit: 100, skip: 0, take: 100 });
    expect(parsePagination({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, skip: 20, take: 10 });
  });

  it('buildPaginationMeta', () => {
    const meta = buildPaginationMeta(45, 2, 20);
    expect(meta.totalPages).toBe(3);
    expect(meta.hasNext).toBe(true);
    expect(meta.hasPrev).toBe(true);
  });
});

describe('TtlCache', () => {
  it('stocke et expire', async () => {
    const cache = new TtlCache<string>(50);
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('a')).toBeUndefined();
  });
});
