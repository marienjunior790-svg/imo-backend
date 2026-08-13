import { randomUUID } from 'crypto';
import { container } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';

/**
 * Pending AI actions — Prisma-backed for multi-instance (Railway) safety.
 * In NODE_ENV=test without an injected client, an in-memory store is used.
 * Known limit without DB table: in-memory Map is NOT HA across instances.
 */

export type PendingActionType =
  | 'GENERATE_LEASE_PDF'
  | 'GENERATE_PAYMENT_RECEIPT'
  | 'GENERATE_PAYMENT_NOTICE'
  | 'CREATE_LEASE'
  | 'CREATE_MAINTENANCE_TICKET'
  | 'SEND_TENANT_MESSAGE'
  | 'SEND_WHATSAPP_MESSAGE'
  | 'SEND_BATCH_TENANT_REMINDERS'
  | 'APPROVE_AUTOMATION_RUN'
  | 'NAVIGATE_HINT';

export interface BatchTenantReminderItem {
  tenantId: string;
  tenantName: string;
  recipientUserId?: string;
  toPhone?: string;
  body: string;
  subject?: string;
  channel: 'IN_APP' | 'WHATSAPP';
}

export interface PendingActionPayload {
  leaseId?: string;
  paymentId?: string;
  tenantName?: string;
  apartmentLabel?: string;
  periodLabel?: string;
  route?: string;
  summary?: string;
  tenantId?: string;
  apartmentId?: string;
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  depositAmount?: number;
  terms?: string;
  activate?: boolean;
  recipientUserId?: string;
  subject?: string;
  body?: string;
  toPhone?: string;
  providerChannel?: 'WHATSAPP' | 'IN_APP' | 'EMAIL' | 'SMS';
  /** Brouillons de relance batch (SEND_BATCH_TENANT_REMINDERS) — pas d’envoi tant que non confirmé. */
  items?: BatchTenantReminderItem[];
  /** APPROVE_AUTOMATION_RUN */
  runId?: string;
  kind?: string;
  itemCount?: number;
  /** CREATE_MAINTENANCE_TICKET */
  title?: string;
  description?: string;
  priority?: string;
}

export interface PendingAction {
  id: string;
  organizationId: string;
  userId: string;
  type: PendingActionType;
  payload: PendingActionPayload;
  createdAt: number;
  expiresAt: number;
}

type PendingRow = {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  payload: unknown;
  expiresAt: Date;
  createdAt: Date;
};

type PendingPrismaClient = {
  aiPendingAction: {
    deleteMany: (args: { where: { expiresAt?: { lte: Date } } | Record<string, never> }) => Promise<unknown>;
    create: (args: {
      data: {
        id: string;
        organizationId: string;
        userId: string;
        type: string;
        payload: Prisma.InputJsonValue;
        expiresAt: Date;
      };
    }) => Promise<PendingRow>;
    findUnique: (args: { where: { id: string } }) => Promise<PendingRow | null>;
    findFirst: (args: {
      where: { organizationId: string; userId: string; expiresAt: { gt: Date } };
      orderBy: { createdAt: 'desc' };
    }) => Promise<PendingRow | null>;
    delete: (args: { where: { id: string } }) => Promise<PendingRow>;
  };
};

let clientOverride: PendingPrismaClient | null = null;
let testMemoryClient: PendingPrismaClient | null = null;

function createInMemoryPendingClient(): PendingPrismaClient {
  const store = new Map<string, PendingRow>();

  return {
    aiPendingAction: {
      deleteMany: async ({ where }) => {
        const now = Date.now();
        for (const [id, row] of store) {
          if (where.expiresAt?.lte) {
            if (row.expiresAt.getTime() <= where.expiresAt.lte.getTime()) store.delete(id);
          } else if (Object.keys(where).length === 0) {
            store.delete(id);
          }
        }
        // full clear when where is empty
        if (Object.keys(where).length === 0) store.clear();
        void now;
        return { count: 0 };
      },
      create: async ({ data }) => {
        const row: PendingRow = {
          id: data.id,
          organizationId: data.organizationId,
          userId: data.userId,
          type: data.type,
          payload: data.payload,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
        };
        store.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }) => store.get(where.id) ?? null,
      findFirst: async ({ where, orderBy }) => {
        let best: PendingRow | null = null;
        for (const row of store.values()) {
          if (row.organizationId !== where.organizationId) continue;
          if (row.userId !== where.userId) continue;
          if (row.expiresAt.getTime() <= where.expiresAt.gt.getTime()) continue;
          if (!best || (orderBy.createdAt === 'desc' && row.createdAt > best.createdAt)) {
            best = row;
          }
        }
        return best;
      },
      delete: async ({ where }) => {
        const row = store.get(where.id);
        if (!row) throw new Error('Record to delete does not exist');
        store.delete(where.id);
        return row;
      },
    },
  };
}

function getClient(): PendingPrismaClient {
  if (clientOverride) return clientOverride;
  if (process.env.NODE_ENV === 'test') {
    if (!testMemoryClient) testMemoryClient = createInMemoryPendingClient();
    return testMemoryClient;
  }
  return container.resolve(PrismaService) as unknown as PendingPrismaClient;
}

function toPendingAction(row: PendingRow): PendingAction {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    type: row.type as PendingActionType,
    payload: (row.payload ?? {}) as PendingActionPayload,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  };
}

async function purgeExpired(): Promise<void> {
  const client = getClient();
  await client.aiPendingAction.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
}

export async function createPendingAction(input: {
  organizationId: string;
  userId: string;
  type: PendingActionType;
  payload: PendingActionPayload;
}): Promise<PendingAction> {
  await purgeExpired();
  const now = Date.now();
  const client = getClient();
  const row = await client.aiPendingAction.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
      expiresAt: new Date(now + env.AI_PENDING_ACTION_TTL_MS),
    },
  });
  return toPendingAction(row);
}

export async function getPendingAction(
  id: string,
  organizationId: string,
  userId: string,
): Promise<PendingAction> {
  await purgeExpired();
  const client = getClient();
  const row = await client.aiPendingAction.findUnique({ where: { id } });
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    throw new NotFoundError('Action IA introuvable ou expirée');
  }
  if (row.organizationId !== organizationId) {
    throw new ValidationError('Action IA hors organisation');
  }
  if (row.userId !== userId) {
    throw new ValidationError('Action IA réservée à l’utilisateur qui l’a proposée');
  }
  return toPendingAction(row);
}

export async function consumePendingAction(
  id: string,
  organizationId: string,
  userId: string,
): Promise<PendingAction> {
  const action = await getPendingAction(id, organizationId, userId);
  const client = getClient();
  await client.aiPendingAction.delete({ where: { id } });
  return action;
}

export async function cancelPendingAction(
  id: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  await getPendingAction(id, organizationId, userId);
  const client = getClient();
  await client.aiPendingAction.delete({ where: { id } });
}

/** Pending le plus récent pour cet utilisateur (non expiré), ou null. */
export async function getLatestPendingForUser(
  organizationId: string,
  userId: string,
): Promise<PendingAction | null> {
  await purgeExpired();
  const client = getClient();
  const row = await client.aiPendingAction.findFirst({
    where: {
      organizationId,
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  return row ? toPendingAction(row) : null;
}

/** Inject Prisma (or mock) for integration-style unit tests. */
export function _setPendingActionsPrismaForTests(client: PendingPrismaClient | null): void {
  clientOverride = client;
}

/** Exposed for unit tests — resets in-memory / mock store. */
export async function _resetPendingActionsForTests(): Promise<void> {
  if (clientOverride) {
    await clientOverride.aiPendingAction.deleteMany({ where: {} });
    return;
  }
  testMemoryClient = createInMemoryPendingClient();
}

/** Build an in-memory Prisma-shaped client for security unit tests. */
export function _createInMemoryPendingPrismaForTests(): PendingPrismaClient {
  return createInMemoryPendingClient();
}
