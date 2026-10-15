import { SubscriptionStatus } from '@prisma/client';
import { AppError } from './app.error.js';

/** Erreur abonnement — format JSON compatible SaaS */
export class SubscriptionError extends AppError {
  constructor(
    message: string,
    public readonly subscriptionStatus: SubscriptionStatus,
    code = 'SUBSCRIPTION_INACTIVE',
  ) {
    super(403, message, code);
    this.name = 'SubscriptionError';
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      subscriptionStatus: this.subscriptionStatus,
    };
  }
}

export type BillingDenialCode =
  | 'TRIAL_EXPIRED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_CANCELLED'
  | 'ORGANIZATION_SUBSCRIPTION_INACTIVE'
  | 'PLAN_UPGRADE_REQUIRED'
  | 'AI_QUOTA_EXCEEDED';

/**
 * Refus lié à l'abonnement (HTTP 403). `kind: "SUBSCRIPTION"` permet au client de le distinguer
 * d'une erreur réseau, d'une session expirée (401) ou d'un refus lié au rôle.
 */
export class BillingAccessError extends AppError {
  constructor(
    code: BillingDenialCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(403, message, code);
    this.name = 'BillingAccessError';
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      error: this.message,
      code: this.code,
      kind: 'SUBSCRIPTION',
      ...this.details,
    };
  }
}

export class PlanLimitError extends AppError {
  constructor(message: string, public readonly limitKey: string) {
    super(403, message, 'PLAN_LIMIT_EXCEEDED');
    this.name = 'PlanLimitError';
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      limit: this.limitKey,
    };
  }
}
