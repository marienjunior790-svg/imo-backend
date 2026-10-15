import { inject, injectable } from 'tsyringe';
import type Stripe from 'stripe';
import { BillingPeriod, Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { env } from '../../config/env.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { clock } from '../../shared/time/clock.js';
import { SubscriptionEventInput, SubscriptionService } from './subscription.service.js';
import { SubscriptionNotifier } from './subscription.notifier.js';
import { offerForStripePrice, purchasablePriceId } from './pricing.config.js';
import { PAID_PLANS, PaidPlan, PLAN_LABELS } from './plans.config.js';
import { getStripe } from './stripe.gateway.js';

const PROVIDER = 'stripe';
/** Un traitement resté « en cours » plus longtemps est considéré interrompu et peut être repris. */
const STALE_PROCESSING_MS = 5 * 60_000;

export type WebhookOutcome = 'PROCESSED' | 'IGNORED' | 'DUPLICATE';

function publicBaseUrl(): string {
  return (env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, '');
}

function toDate(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/** Statut Stripe → statut ITC. null = rien à appliquer (paiement initial non confirmé). */
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
      return SubscriptionStatus.CANCELLED;
    default:
      return null;
  }
}

/**
 * Facturation Stripe : Checkout pour souscrire, portail client pour la carte et les factures,
 * webhook signé comme seule source d'activation.
 */
@injectable()
export class StripeBillingService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
    @inject(SubscriptionNotifier) private readonly notifier: SubscriptionNotifier,
  ) {}

  // ─── Actions du propriétaire ───────────────────────────────────────────────

  async createCheckout(
    organizationId: string,
    actor: { userId: string; email: string | null },
    plan: PaidPlan,
    period: BillingPeriod,
  ): Promise<{ url: string }> {
    const price = purchasablePriceId(plan, period);
    if (!price) {
      throw new AppError(409, 'Cette offre n\'est pas encore disponible à l\'achat.', 'OFFER_UNAVAILABLE');
    }
    const sub = await this.activeRecord(organizationId);
    if (sub.paymentProvider === PROVIDER && sub.externalSubscriptionId && sub.status !== SubscriptionStatus.CANCELLED) {
      throw new ConflictError('Un abonnement est déjà en place : changez d\'offre depuis la page Abonnement.');
    }

    const stripe = getStripe();
    const customer = await this.ensureCustomer(organizationId, sub.customerId, actor.email);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: organizationId,
      line_items: [{ price, quantity: 1 }],
      metadata: { organizationId, plan, period },
      subscription_data: { metadata: { organizationId, plan, period } },
      locale: 'fr',
      success_url: `${publicBaseUrl()}/billing/return?status=success`,
      cancel_url: `${publicBaseUrl()}/billing/return?status=cancel`,
    });
    if (!session.url) throw new AppError(502, 'Le service de paiement n\'a pas répondu correctement.', 'PAYMENT_PROVIDER_ERROR');

    await this.subscriptions.recordEvent(organizationId, sub.id, {
      type: 'CHECKOUT_STARTED',
      source: 'stripe',
      actorUserId: actor.userId,
      externalRef: session.id,
      details: { plan, period },
    });
    return { url: session.url };
  }

  async createPortal(organizationId: string): Promise<{ url: string }> {
    const sub = await this.activeRecord(organizationId);
    if (!sub.customerId) {
      throw new ValidationError('Aucun moyen de paiement enregistré : choisissez d\'abord une offre.');
    }
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.customerId,
      locale: 'fr',
      return_url: `${publicBaseUrl()}/billing/return?status=portal`,
    });
    return { url: session.url };
  }

  /** Résiliation à la fin de la période payée (ou annulation de cette résiliation). */
  async setCancelAtPeriodEnd(organizationId: string, cancel: boolean, actorUserId: string): Promise<void> {
    const sub = await this.activeRecord(organizationId);
    if (sub.paymentProvider !== PROVIDER || !sub.externalSubscriptionId) {
      throw new ValidationError('Aucun abonnement payant à modifier.');
    }
    await getStripe().subscriptions.update(sub.externalSubscriptionId, { cancel_at_period_end: cancel });
    await this.subscriptions.recordEvent(organizationId, sub.id, {
      type: cancel ? 'CANCEL_REQUESTED' : 'RESUME_REQUESTED',
      source: 'stripe',
      actorUserId,
    });
  }

  /**
   * Changement d'offre : montée immédiate avec facturation au prorata (appliquée seulement si le paiement aboutit),
   * descente ou changement de période à la fin de la période en cours.
   */
  async changePlan(
    organizationId: string,
    plan: PaidPlan,
    period: BillingPeriod,
    actorUserId: string,
  ): Promise<{ applied: 'NOW' | 'AT_PERIOD_END' }> {
    const sub = await this.activeRecord(organizationId);
    if (sub.paymentProvider !== PROVIDER || !sub.externalSubscriptionId) {
      throw new ValidationError('Aucun abonnement payant : choisissez une offre.');
    }
    const price = purchasablePriceId(plan, period);
    if (!price) throw new AppError(409, 'Cette offre n\'est pas encore disponible à l\'achat.', 'OFFER_UNAVAILABLE');

    const stripe = getStripe();
    const current = await stripe.subscriptions.retrieve(sub.externalSubscriptionId);
    const item = current.items.data[0];
    if (!item) throw new AppError(502, 'Abonnement Stripe incomplet.', 'PAYMENT_PROVIDER_ERROR');
    if (item.price.id === price) throw new ValidationError('Vous êtes déjà sur cette offre.');

    const currentPlan = offerForStripePrice(item.price.id)?.plan;
    const upgrade =
      currentPlan != null && PAID_PLANS.indexOf(plan) > PAID_PLANS.indexOf(currentPlan);

    if (upgrade) {
      await stripe.subscriptions.update(current.id, {
        items: [{ id: item.id, price }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
      });
    } else {
      const schedule = current.schedule
        ? await stripe.subscriptionSchedules.retrieve(idOf(current.schedule)!)
        : await stripe.subscriptionSchedules.create({ from_subscription: current.id });
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
          {
            items: [{ price: item.price.id, quantity: 1 }],
            start_date: current.current_period_start,
            end_date: current.current_period_end,
          },
          { items: [{ price, quantity: 1 }], metadata: { organizationId, plan, period } },
        ],
      });
    }

    await this.subscriptions.recordEvent(organizationId, sub.id, {
      type: upgrade ? 'UPGRADE_REQUESTED' : 'CHANGE_SCHEDULED',
      source: 'stripe',
      actorUserId,
      details: { plan, period },
    });
    return { applied: upgrade ? 'NOW' : 'AT_PERIOD_END' };
  }

  // ─── Webhook ───────────────────────────────────────────────────────────────

  /** Vérifie la signature puis traite l'événement une seule fois. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookOutcome> {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError(503, 'Webhook Stripe non configuré', 'PAYMENT_UNAVAILABLE');
    }
    if (!signature) throw new AppError(400, 'Signature Stripe absente', 'INVALID_SIGNATURE');
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new AppError(400, 'Signature Stripe invalide', 'INVALID_SIGNATURE');
    }

    if (!(await this.claim(event))) return 'DUPLICATE';

    try {
      const result = await this.process(event);
      await this.prisma.paymentProviderEvent.update({
        where: { provider_eventId: { provider: PROVIDER, eventId: event.id } },
        data: { status: result.outcome, organizationId: result.organizationId, processedAt: clock.now(), error: null },
      });
      return result.outcome;
    } catch (err) {
      await this.prisma.paymentProviderEvent.update({
        where: { provider_eventId: { provider: PROVIDER, eventId: event.id } },
        data: { status: 'FAILED', error: err instanceof Error ? err.message.slice(0, 500) : 'Erreur inconnue' },
      });
      throw err;
    }
  }

  /** Réserve l'événement ; faux si déjà traité ou en cours de traitement ailleurs. */
  private async claim(event: Stripe.Event): Promise<boolean> {
    try {
      await this.prisma.paymentProviderEvent.create({
        data: { provider: PROVIDER, eventId: event.id, type: event.type, status: 'PROCESSING' },
      });
      return true;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
    const retry = await this.prisma.paymentProviderEvent.updateMany({
      where: {
        provider: PROVIDER,
        eventId: event.id,
        OR: [
          { status: 'FAILED' },
          { status: 'PROCESSING', receivedAt: { lt: new Date(clock.now().getTime() - STALE_PROCESSING_MS) } },
        ],
      },
      data: { status: 'PROCESSING', receivedAt: clock.now() },
    });
    return retry.count === 1;
  }

  private async process(event: Stripe.Event): Promise<{ outcome: 'PROCESSED' | 'IGNORED'; organizationId: string | null }> {
    const stripe = getStripe();
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const subscriptionId = idOf(session.subscription);
        if (session.mode !== 'subscription' || !subscriptionId) return { outcome: 'IGNORED', organizationId: null };
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
          return { outcome: 'IGNORED', organizationId: null };
        }
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        return this.sync(sub, { type: 'ACTIVATED', source: 'stripe', externalRef: event.id }, session.client_reference_id);
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscriptionId = idOf(invoice.subscription);
        if (!subscriptionId) return { outcome: 'IGNORED', organizationId: null };
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const type =
          invoice.billing_reason === 'subscription_cycle'
            ? 'RENEWED'
            : invoice.billing_reason === 'subscription_update'
              ? 'PLAN_CHANGED'
              : 'ACTIVATED';
        return this.sync(sub, {
          type,
          source: 'stripe',
          externalRef: event.id,
          details: { invoiceId: invoice.id, amountPaid: invoice.amount_paid, currency: invoice.currency },
        });
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = idOf(invoice.subscription);
        if (!subscriptionId) return { outcome: 'IGNORED', organizationId: null };
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        return this.sync(sub, {
          type: 'PAYMENT_FAILED',
          source: 'stripe',
          externalRef: event.id,
          details: { invoiceId: invoice.id, attempt: invoice.attempt_count },
        });
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = await stripe.subscriptions.retrieve(event.data.object.id);
        const type =
          event.type === 'customer.subscription.deleted'
            ? 'CANCELLED'
            : sub.cancel_at_period_end
              ? 'CANCEL_SCHEDULED'
              : 'SUBSCRIPTION_UPDATED';
        return this.sync(sub, { type, source: 'stripe', externalRef: event.id });
      }
      default:
        return { outcome: 'IGNORED', organizationId: null };
    }
  }

  /**
   * Recopie l'état actuel de l'abonnement Stripe (relu auprès de Stripe, pas depuis l'événement) :
   * l'ordre d'arrivée des événements n'a donc pas d'importance.
   */
  private async sync(
    sub: Stripe.Subscription,
    event: SubscriptionEventInput,
    hintOrganizationId?: string | null,
  ): Promise<{ outcome: 'PROCESSED' | 'IGNORED'; organizationId: string | null }> {
    const status = mapStatus(sub.status);
    const organizationId = await this.organizationFor(sub, hintOrganizationId);
    if (!status) return { outcome: 'IGNORED', organizationId };

    const priceId = sub.items.data[0]?.price.id;
    const offer = priceId ? offerForStripePrice(priceId) : null;
    if (!offer) throw new Error(`Prix Stripe inconnu (${priceId ?? 'absent'}) : vérifier STRIPE_PRICE_*`);

    const record = await this.activeRecord(organizationId);
    const before = { plan: record.plan, status: record.status, periodEnd: record.currentPeriodEnd?.getTime() ?? null };

    await this.subscriptions.applyPaidState(
      organizationId,
      {
        plan: offer.plan,
        status,
        billingPeriod: offer.period,
        currentPeriodStart: toDate(sub.current_period_start),
        currentPeriodEnd: toDate(sub.current_period_end),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        cancelledAt: toDate(sub.canceled_at),
        paymentProvider: 'stripe',
        customerId: idOf(sub.customer),
        externalSubscriptionId: sub.id,
      },
      event,
    );

    const changed =
      before.plan !== offer.plan ||
      before.status !== status ||
      before.periodEnd !== (toDate(sub.current_period_end)?.getTime() ?? null);
    if (changed || (event.type === 'PAYMENT_FAILED' && status === SubscriptionStatus.PAST_DUE)) {
      await this.notify(organizationId, event.type, offer.plan, toDate(sub.current_period_end));
    }
    return { outcome: 'PROCESSED', organizationId };
  }

  private async notify(organizationId: string, type: string, plan: PaidPlan, periodEnd: Date | null) {
    const until = periodEnd
      ? periodEnd.toLocaleDateString('fr-FR', { timeZone: 'Africa/Brazzaville', day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const label = PLAN_LABELS[plan];
    const notices: Record<string, { title: string; message: string } | undefined> = {
      ACTIVATED: { title: 'Abonnement activé', message: `Paiement confirmé : votre offre ${label} est active${until ? ` jusqu'au ${until}` : ''}.` },
      RENEWED: { title: 'Abonnement renouvelé', message: `Paiement confirmé : votre offre ${label} est renouvelée${until ? ` jusqu'au ${until}` : ''}.` },
      PLAN_CHANGED: { title: 'Offre modifiée', message: `Votre offre ${label} est active.` },
      SUBSCRIPTION_UPDATED: { title: 'Abonnement mis à jour', message: `Votre offre ${label} est active${until ? ` jusqu'au ${until}` : ''}.` },
      PAYMENT_FAILED: {
        title: 'Paiement refusé',
        message: `Le paiement de votre offre ${label} n'a pas abouti. Mettez à jour votre moyen de paiement pour éviter l'interruption${until ? ` le ${until}` : ''}.`,
      },
      CANCEL_SCHEDULED: { title: 'Résiliation programmée', message: `Votre offre ${label} reste active${until ? ` jusqu'au ${until}` : ''}, puis ne sera pas renouvelée.` },
      CANCELLED: { title: 'Abonnement résilié', message: 'Votre abonnement est résilié. Vos données sont conservées ; choisissez une offre pour continuer.' },
    };
    const notice = notices[type];
    if (!notice) return;
    await this.notifier
      .notifyOwners({ organizationId, kind: `SUBSCRIPTION_${type}`, ...notice, email: true })
      .catch((err) => console.warn('[stripe] notification non créée:', err instanceof Error ? err.message : err));
  }

  private async organizationFor(sub: Stripe.Subscription, hint?: string | null): Promise<string> {
    const fromMetadata = sub.metadata?.organizationId || hint;
    if (fromMetadata) {
      const exists = await this.prisma.organization.findUnique({ where: { id: fromMetadata }, select: { id: true } });
      if (exists) return exists.id;
    }
    const known = await this.prisma.subscription.findFirst({
      where: { OR: [{ externalSubscriptionId: sub.id }, { customerId: idOf(sub.customer) ?? '__none__' }] },
      select: { organizationId: true },
    });
    if (known) return known.organizationId;
    throw new NotFoundError(`Organisation introuvable pour l'abonnement Stripe ${sub.id}`);
  }

  private async activeRecord(organizationId: string): Promise<Subscription> {
    const load = () =>
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { activeSubscription: true },
      });
    let org = await load();
    if (!org) throw new NotFoundError('Organisation introuvable');
    if (!org.activeSubscription) {
      await this.subscriptions.getAccess(organizationId);
      org = await load();
    }
    if (!org?.activeSubscription) throw new NotFoundError('Abonnement introuvable');
    return org.activeSubscription;
  }

  private async ensureCustomer(organizationId: string, existing: string | null, email: string | null): Promise<string> {
    if (existing) return existing;
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    const customer = await getStripe().customers.create({
      name: org?.name,
      email: email ?? undefined,
      metadata: { organizationId },
    });
    await this.prisma.subscription.updateMany({
      where: { organizationId, activeForOrganization: { isNot: null } },
      data: { customerId: customer.id },
    });
    return customer.id;
  }
}
