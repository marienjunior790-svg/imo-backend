import { LeaseStatus, UserRole } from '@prisma/client';
import {
  buildReminderBody,
  detectPaymentReminderPlan,
  runPaymentReminderPlan,
} from '../../src/modules/ai/ai.orchestrator.js';
import {
  _resetPendingActionsForTests,
  getPendingAction,
} from '../../src/modules/ai/ai.pending-actions.js';
import type { AiToolsService } from '../../src/modules/ai/ai.tools.js';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

jest.mock('../../src/config/env.js', () => {
  const actual = jest.requireActual('../../src/config/env.js') as Record<string, unknown>;
  return {
    ...actual,
    isWhatsAppConfigured: true,
    env: {
      ...(actual.env as Record<string, unknown>),
      WHATSAPP_DEFAULT_COUNTRY_CODE: '242',
      AI_PENDING_ACTION_TTL_MS: 60_000,
    },
  };
});

describe('detectPaymentReminderPlan', () => {
  it('détecte la phrase multi-étapes cible', () => {
    expect(
      detectPaymentReminderPlan(
        'Trouve les locataires qui ont des impayés, vérifie leurs contrats et prépare les relances.',
      ),
    ).toBe(true);
  });

  it('détecte la phrase E2E sans accents (ASCII)', () => {
    expect(
      detectPaymentReminderPlan(
        'Trouve les locataires qui ont des impayes, verifie leurs contrats et prepare les relances.',
      ),
    ).toBe(true);
  });

  it('détecte variantes prépare / bail / prévenir', () => {
    expect(
      detectPaymentReminderPlan('Prépare les relances pour les baux en impayés'),
    ).toBe(true);
    expect(
      detectPaymentReminderPlan('Vérifie les contrats et préviens les locataires en retard'),
    ).toBe(true);
  });

  it('rejette les intents partiels (pas de faux positif)', () => {
    expect(detectPaymentReminderPlan('Voir mes impayés')).toBe(false);
    expect(detectPaymentReminderPlan('Vérifie leurs contrats')).toBe(false);
    expect(detectPaymentReminderPlan('Prépare un message')).toBe(false);
    expect(detectPaymentReminderPlan('Liste des locataires')).toBe(false);
  });
});

describe('buildReminderBody', () => {
  it('inclut montant et période réels', () => {
    const body = buildReminderBody({
      name: 'Marie Dupont',
      amountXaf: 150000,
      period: '7/2026',
    });
    expect(body).toContain('Marie Dupont');
    expect(body).toContain('150');
    expect(body).toContain('XAF');
    expect(body).toContain('7/2026');
    expect(body).toContain('ITC');
  });
});

describe('runPaymentReminderPlan', () => {
  beforeEach(async () => {
    await _resetPendingActionsForTests();
  });

  it('N=0 → 0 concernés, pas de pending, pas de faux brouillons', async () => {
    const tools = {
      execute: jest.fn().mockResolvedValue({ count: 0, items: [], totalRemainingXaf: 0 }),
    } as unknown as AiToolsService;
    const prisma = {
      lease: { findMany: jest.fn() },
      tenant: { findMany: jest.fn() },
    } as unknown as PrismaService;

    const result = await runPaymentReminderPlan({
      organizationId: 'org1',
      userId: 'user1',
      role: UserRole.OWNER,
      tools,
      prisma,
    });

    expect(tools.execute).toHaveBeenCalledWith(
      'org1',
      'getOutstandingPayments',
      {},
      { userId: 'user1', role: UserRole.OWNER },
    );
    expect(prisma.lease.findMany).not.toHaveBeenCalled();
    expect(result.pendingAction).toBeUndefined();
    expect(result.reply).toMatch(/0 locataire/);
    expect(result.reply).toMatch(/Aucune relance|0 relance/);
    expect(result.steps.map((s) => s.status)).toEqual(['done', 'skipped', 'skipped']);
    expect(result.toolsUsed).toEqual(['getOutstandingPayments']);
  });

  it('2 locataires dont 1 sans canal → 1 brouillon + 1 intervention + pending', async () => {
    const tools = {
      execute: jest.fn().mockResolvedValue({
        count: 2,
        totalRemainingXaf: 200000,
        items: [
          {
            id: 'pay1',
            tenantId: 't1',
            tenantName: 'Alice Portal',
            remainingXaf: 100000,
            period: '7/2026',
            status: 'LATE',
          },
          {
            id: 'pay2',
            tenantId: 't2',
            tenantName: 'Bob NoChannel',
            remainingXaf: 100000,
            period: '7/2026',
            status: 'PENDING',
          },
        ],
      }),
    } as unknown as AiToolsService;

    const prisma = {
      lease: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lease1', tenantId: 't1', status: LeaseStatus.ACTIVE },
          { id: 'lease2', tenantId: 't2', status: LeaseStatus.DRAFT },
        ]),
      },
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 't1',
            firstName: 'Alice',
            lastName: 'Portal',
            userId: 'portal-user-1',
            phone: '066000000',
          },
          {
            id: 't2',
            firstName: 'Bob',
            lastName: 'NoChannel',
            userId: null,
            phone: '',
          },
        ]),
      },
    } as unknown as PrismaService;

    const result = await runPaymentReminderPlan({
      organizationId: 'org1',
      userId: 'user1',
      role: UserRole.OWNER,
      tools,
      prisma,
    });

    expect(result.reply).toMatch(/2 locataire/);
    expect(result.reply).toMatch(/1 relance/);
    expect(result.reply).toMatch(/1 dossier/);
    expect(result.reply).toMatch(/Je vais envoyer une relance à 1 locataire/);
    expect(result.pendingAction).toBeDefined();
    expect(result.pendingAction?.type).toBe('SEND_BATCH_TENANT_REMINDERS');
    expect(result.pendingAction?.payload.items).toHaveLength(1);
    expect(result.pendingAction?.payload.items?.[0]).toMatchObject({
      tenantId: 't1',
      channel: 'IN_APP',
      recipientUserId: 'portal-user-1',
    });
    expect(result.pendingAction?.payload.items?.[0].body).toContain('Alice Portal');
    expect(result.pendingAction?.payload.items?.[0].body).toContain('100');
    expect(result.steps.every((s) => s.status === 'done')).toBe(true);

    const stored = await getPendingAction(result.pendingAction!.id, 'org1', 'user1');
    expect(stored.type).toBe('SEND_BATCH_TENANT_REMINDERS');
    expect(stored.payload.items).toHaveLength(1);
  });
});
