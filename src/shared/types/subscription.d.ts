import type { AccessState } from '../../modules/subscriptions/access.rules.js';

/** Contexte abonnement attaché à chaque requête authentifiée */
export type SubscriptionContext = AccessState & {
  /** Ancien nom de accessEndsAt, conservé pour les modules existants. */
  expiresAt: Date | null;
};

declare global {
  namespace Express {
    interface Request {
      subscription?: SubscriptionContext;
    }
  }
}

export {};
