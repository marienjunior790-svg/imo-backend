import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app.error.js';

let client: Stripe | null = null;

/** Client Stripe (clé secrète lue uniquement dans l'environnement du serveur). */
export function getStripe(): Stripe {
  if (client) return client;
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, 'Le paiement en ligne n\'est pas encore disponible.', 'PAYMENT_UNAVAILABLE');
  }
  client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia', maxNetworkRetries: 2 });
  return client;
}

/** Remplace le client (tests uniquement). */
export function setStripeClient(next: Stripe | null): void {
  client = next;
}
