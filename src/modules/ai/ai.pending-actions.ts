import { randomUUID } from 'crypto';
import { env } from '../../config/env.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';

export type PendingActionType =
  | 'GENERATE_LEASE_PDF'
  | 'GENERATE_PAYMENT_RECEIPT'
  | 'GENERATE_PAYMENT_NOTICE'
  | 'NAVIGATE_HINT';

export interface PendingActionPayload {
  leaseId?: string;
  paymentId?: string;
  tenantName?: string;
  apartmentLabel?: string;
  periodLabel?: string;
  route?: string;
  summary?: string;
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

/** Exposed for unit tests */
export function _resetPendingActionsForTests(): void {
  store.clear();
}
