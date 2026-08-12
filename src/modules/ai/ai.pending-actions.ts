import { randomUUID } from 'crypto';
import { env } from '../../config/env.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';

export type PendingActionType =
  | 'GENERATE_LEASE_PDF'
  | 'GENERATE_PAYMENT_RECEIPT'
  | 'GENERATE_PAYMENT_NOTICE'
  | 'CREATE_LEASE'
  | 'SEND_TENANT_MESSAGE'
  | 'SEND_WHATSAPP_MESSAGE'
  | 'SEND_BATCH_TENANT_REMINDERS'
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

const store = new Map<string, PendingAction>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [id, action] of store) {
    if (action.expiresAt <= now) store.delete(id);
  }
}

export function createPendingAction(input: {
  organizationId: string;
  userId: string;
  type: PendingActionType;
  payload: PendingActionPayload;
}): PendingAction {
  purgeExpired();
  const now = Date.now();
  const action: PendingAction = {
    id: randomUUID(),
    organizationId: input.organizationId,
    userId: input.userId,
    type: input.type,
    payload: input.payload,
    createdAt: now,
    expiresAt: now + env.AI_PENDING_ACTION_TTL_MS,
  };
  store.set(action.id, action);
  return action;
}

export function getPendingAction(id: string, organizationId: string, userId: string): PendingAction {
  purgeExpired();
  const action = store.get(id);
  if (!action) throw new NotFoundError('Action IA introuvable ou expirée');
  if (action.organizationId !== organizationId) {
    throw new ValidationError('Action IA hors organisation');
  }
  if (action.userId !== userId) {
    throw new ValidationError('Action IA réservée à l’utilisateur qui l’a proposée');
  }
  return action;
}

export function consumePendingAction(id: string, organizationId: string, userId: string): PendingAction {
  const action = getPendingAction(id, organizationId, userId);
  store.delete(id);
  return action;
}

export function cancelPendingAction(id: string, organizationId: string, userId: string): void {
  getPendingAction(id, organizationId, userId);
  store.delete(id);
}

/** Pending le plus récent pour cet utilisateur (non expiré), ou null. */
export function getLatestPendingForUser(
  organizationId: string,
  userId: string,
): PendingAction | null {
  purgeExpired();
  let latest: PendingAction | null = null;
  for (const action of store.values()) {
    if (action.organizationId !== organizationId || action.userId !== userId) continue;
    if (!latest || action.createdAt > latest.createdAt) latest = action;
  }
  return latest;
}

/** Exposed for unit tests */
export function _resetPendingActionsForTests(): void {
  store.clear();
}
