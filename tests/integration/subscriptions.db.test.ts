/**
 * Abonnements Free (plan technique STANDARD) · Pro · Plus · Pro Max — parcours réels sur la base de test
 * (RUN_DB_TESTS=true).
 *
 * Horloge serveur contrôlée (ManualClock) pour les bornes de l'essai. Stripe : signature vérifiée par la
 * bibliothèque officielle avec un secret de test ; les appels réseau (`customers.create`,
 * `checkout.sessions.create`, `subscriptions.retrieve`) sont remplacés, aucun paiement réel ni simulé n'est créé.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import request from 'supertest';
import Stripe from 'stripe';
import { container } from 'tsyringe';
import { BillingPeriod, PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

import { createApp } from '../../src/app.js';
import { ManualClock, resetClock, setClock } from '../../src/shared/time/clock.js';
import { SubscriptionService } from '../../src/modules/subscriptions/subscription.service.js';
import { AiQuotaService } from '../../src/modules/subscriptions/ai-quota.service.js';
import { AI_QUOTAS } from '../../src/modules/subscriptions/quotas.config.js';
import { setStripeClient } from '../../src/modules/subscriptions/stripe.gateway.js';
import { env } from '../../src/config/env.js';
import { PaidPlan } from '../../src/modules/subscriptions/plans.config.js';

const describeDb = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

const H = 3600_000;
const API = '/api/v1';
const PASSWORD = 'Abonnement1!';

describeDb('Abonnements — parcours réels', () => {
  const app = createApp();
  const prisma = new PrismaClient();
  const clk = new ManualClock(Date.now());
  const stamp = Date.now();
  const subscriptions = () => container.resolve(SubscriptionService);

  type Account = { token: string; orgId: string; userId: string; email: string; body: any };

  async function register(email: string, phone?: string): Promise<Account> {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({
        email,
        password: PASSWORD,
        firstName: 'Test',
        lastName: 'Abonnement',
        organizationName: `Org ${email}`,
        organizationType: 'AGENCY',
        ...(phone ? { phone } : {}),
      });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.accessToken,
      orgId: res.body.data.organization.id,
      userId: res.body.data.user.id,
      email,
      body: res.body.data,
    };
  }

  const get = (token: string | null, url: string) => {
    const r = request(app).get(`${API}${url}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const post = (token: string | null, url: string, body: object = {}) => {
    const r = request(app).post(`${API}${url}`).send(body);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const grant = (orgId: string, plan: PaidPlan, until: Date) =>
    subscriptions().adminGrant(orgId, { plan, until, reason: 'test' }, 'test-admin');
  const activeSub = (orgId: string) =>
    prisma.organization
      .findUniqueOrThrow({ where: { id: orgId }, select: { activeSubscription: true } })
      .then((o) => o.activeSubscription!);

  beforeAll(() => setClock(clk));
  afterAll(async () => {
    resetClock();
    setStripeClient(null);
    await prisma.$disconnect();
  });

  // ─── Essai Free ────────────────────────────────────────────────────────────

  describe('Essai Free de 48 heures', () => {
    let owner: Account;
    let start: number;
    let trialAgentToken: string;
    const email = `jean.essai.${stamp}@gmail.com`;
    const phone = `06${String(stamp).slice(-7)}`;

    it('[1][2] démarre à la création du compte sous le nom Free, fin = horloge serveur + 48 h exactement', async () => {
      start = clk.now().getTime();
      owner = await register(email, phone);
      expect(owner.body.trial).toEqual({ granted: true });
      expect(owner.body.subscription).toMatchObject({ plan: 'STANDARD', planLabel: 'Free', isTrial: true, entitled: true });

      const sub = await activeSub(owner.orgId);
      expect(sub.plan).toBe(SubscriptionPlan.STANDARD);
      expect(sub.status).toBe(SubscriptionStatus.TRIALING);
      expect(sub.trialStartedAt!.getTime()).toBe(start);
      expect(sub.trialEndsAt!.getTime() - sub.trialStartedAt!.getTime()).toBe(48 * H);

      const status = await get(owner.token, '/subscription/status');
      expect(status.status).toBe(200);
      expect(status.body.data.planLabel).toBe('Free');
      expect(status.body.data.trialEndsAt).toBe(new Date(start + 48 * H).toISOString());

      const plans = await get(owner.token, '/subscription/plans');
      expect(plans.body.data.plans.map((p: { label: string }) => p.label)).toEqual(['Free', 'Pro', 'Plus', 'Pro Max']);
      expect(JSON.stringify(plans.body)).not.toContain('Standard');
    });

    it('[3] 47 h 59 min 59 s : accès autorisé, données créées', async () => {
      clk.set(start + 48 * H - 1000);
      expect((await get(owner.token, '/buildings')).status).toBe(200);
      const created = await post(owner.token, '/buildings', { name: 'Résidence Essai', address: '12 avenue Test' });
      expect(created.status).toBe(201);
    });

    it('[7][8] pendant l\'essai Free (droits de Plus) : menus Agent et Locataire ouverts, IA réservée à Pro Max', async () => {
      expect((await get(owner.token, '/maintenance/agents')).status).toBe(200);
      expect((await get(owner.token, '/tenants/portal-access-settings')).status).toBe(200);

      const agentEmail = `agent.essai.${stamp}@itc-test.cg`;
      const created = await post(owner.token, '/admin/users', {
        email: agentEmail,
        password: PASSWORD,
        firstName: 'Agent',
        lastName: 'Essai',
        role: 'AGENT',
      });
      expect([200, 201]).toContain(created.status);
      const login = await post(null, '/auth/login', { email: agentEmail, password: PASSWORD });
      trialAgentToken = login.body.data.accessToken;
      expect((await get(trialAgentToken, '/agent/dashboard')).status).toBe(200);
      // Les permissions propres du rôle restent appliquées : l'essai n'ouvre pas les droits du propriétaire.
      expect((await get(trialAgentToken, '/buildings')).body.code).toBe('FORBIDDEN');

      const ai = await get(owner.token, '/ai/analysis-types');
      expect(ai.status).toBe(403);
      expect(ai.body).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'PRO_MAX' });
      const caps = (await get(owner.token, '/subscription/status')).body.data.capabilities;
      expect(caps).toEqual(expect.arrayContaining(['CORE_MANAGEMENT', 'AGENT_MENU', 'TENANT_MENU']));
      expect(caps).not.toContain('AI');
    });

    it('[4] 48 h exactement : bloqué avec un code métier, propriétaire comme agent', async () => {
      clk.set(start + 48 * H);
      const res = await get(owner.token, '/buildings');
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'TRIAL_EXPIRED', kind: 'SUBSCRIPTION' });
      expect((await post(owner.token, '/buildings', { name: 'Après essai', address: '1 rue Bloquée' })).status).toBe(403);
      expect((await get(owner.token, '/maintenance/agents')).status).toBe(403);
      expect((await get(owner.token, '/tenants/portal-access-settings')).status).toBe(403);
      const agent = await get(trialAgentToken, '/agent/dashboard');
      expect(agent.status).toBe(403);
      expect(agent.body).toMatchObject({ code: 'ORGANIZATION_SUBSCRIPTION_INACTIVE', kind: 'SUBSCRIPTION' });

      clk.set(start + 48 * H + 1);
      expect((await get(owner.token, '/buildings')).body.code).toBe('TRIAL_EXPIRED');
    });

    it('expiration Free : ni paiement, ni changement d\'offre, ni résiliation enregistrés', async () => {
      await subscriptions().expireDue();
      const sub = await activeSub(owner.orgId);
      expect(sub).toMatchObject({ plan: SubscriptionPlan.STANDARD, status: SubscriptionStatus.EXPIRED, paymentProvider: 'trial' });
      expect(sub.cancelledAt).toBeNull();
      expect(await prisma.paymentProviderEvent.count({ where: { organizationId: owner.orgId } })).toBe(0);
      const types = (await prisma.subscriptionEvent.findMany({ where: { organizationId: owner.orgId } })).map((e) => e.type);
      expect(types).not.toEqual(expect.arrayContaining(['CANCELLED']));
      expect(types).not.toEqual(expect.arrayContaining(['ACTIVATED']));
      const view = await get(owner.token, '/subscription/status');
      expect(view.body.data).toMatchObject({ planLabel: 'Free', isTrial: true, entitled: false, denial: 'TRIAL_EXPIRED' });
      expect(view.body.data.denialMessage).toContain('Free');
      expect(view.body.data.denialMessage).toContain('données sont conservés');
    });

    it('[14] l\'heure envoyée par le téléphone est ignorée', async () => {
      const earlier = new Date(start).toUTCString();
      const res = await get(owner.token, '/buildings')
        .set('Date', earlier)
        .set('X-Client-Time', String(start))
        .query({ now: start });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TRIAL_EXPIRED');
    });

    it('[5] après expiration : connexion, profil, paramètres et page Abonnement restent accessibles', async () => {
      const relog = await post(null, '/auth/login', { email, password: PASSWORD });
      expect(relog.status).toBe(200);
      expect(relog.body.data.user.id).toBe(owner.userId);
      expect((await get(owner.token, '/auth/me')).status).toBe(200);
      const overview = await get(owner.token, '/subscription');
      expect(overview.status).toBe(200);
      expect(overview.body.data.subscription).toMatchObject({ status: 'EXPIRED', entitled: false });
      expect(overview.body.data.offers).toHaveLength(6);
      expect((await get(owner.token, '/subscription/plans')).status).toBe(200);
      const history = await get(owner.token, '/subscription/history');
      expect(history.body.data.map((e: { type: string }) => e.type)).toEqual(
        expect.arrayContaining(['TRIAL_STARTED', 'TRIAL_EXPIRED']),
      );
    });

    it('[6] les données sont conservées et réapparaissent après souscription', async () => {
      expect(await prisma.building.count({ where: { organizationId: owner.orgId } })).toBe(1);
      await grant(owner.orgId, 'PRO', new Date(clk.now().getTime() + 30 * 24 * H));
      const list = await get(owner.token, '/buildings');
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).toContain('Résidence Essai');
    });

    it('[16] reconnexion / réinstallation : aucun nouvel essai', async () => {
      const before = await prisma.subscription.count({ where: { organizationId: owner.orgId } });
      const login = await post(null, '/auth/login', { email, password: PASSWORD });
      expect(login.status).toBe(200);
      expect(await prisma.subscription.count({ where: { organizationId: owner.orgId } })).toBe(before);
      const trialEvents = await prisma.subscriptionEvent.count({
        where: { organizationId: owner.orgId, type: 'TRIAL_STARTED' },
      });
      expect(trialEvents).toBe(1);
    });

    it('[15] même e-mail (variante) ou même téléphone : compte créé, sans essai', async () => {
      const variant = await register(`Jean.Essai.${stamp}+bis@googlemail.com`);
      expect(variant.body.trial).toEqual({ granted: false, reason: 'TRIAL_ALREADY_USED' });
      const blocked = await get(variant.token, '/buildings');
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('TRIAL_EXPIRED');

      const samePhone = await register(`autre.${stamp}@itc-test.cg`, `+242 ${phone}`);
      expect(samePhone.body.trial.granted).toBe(false);
    });
  });

  // ─── Offres et rôles ───────────────────────────────────────────────────────

  describe('Offres Pro, Plus, Pro Max et rôles', () => {
    let owner: Account;
    let agentToken: string;
    const until = () => new Date(clk.now().getTime() + 30 * 24 * H);

    beforeAll(async () => {
      clk.set(Date.now());
      owner = await register(`offres.${stamp}@itc-test.cg`);
    });

    it('[7] Pro : gestion essentielle, sans Agent, Locataire ni IA', async () => {
      await grant(owner.orgId, 'PRO', until());
      expect((await get(owner.token, '/buildings')).status).toBe(200);
      expect((await get(owner.token, '/maintenance/agents')).body.requiredPlan).toBe('PLUS');
      expect((await get(owner.token, '/tenants/portal-access-settings')).body.requiredPlan).toBe('PLUS');
      expect((await get(owner.token, '/ai/analysis-types')).body.requiredPlan).toBe('PRO_MAX');
    });

    it('[8] Plus : Agent et Locataire, sans IA', async () => {
      await grant(owner.orgId, 'PLUS', until());
      expect((await get(owner.token, '/maintenance/agents')).status).toBe(200);
      expect((await get(owner.token, '/tenants/portal-access-settings')).status).toBe(200);
      const ai = await get(owner.token, '/ai/analysis-types');
      expect(ai.status).toBe(403);
      expect(ai.body.requiredPlan).toBe('PRO_MAX');
    });

    it('[9] Pro Max : toutes les capacités', async () => {
      await grant(owner.orgId, 'PRO_MAX', until());
      expect((await get(owner.token, '/ai/analysis-types')).status).toBe(200);
      expect((await get(owner.token, '/maintenance/agents')).status).toBe(200);
      const status = await get(owner.token, '/subscription/status');
      expect(status.body.data.capabilities).toEqual(
        expect.arrayContaining(['CORE_MANAGEMENT', 'AGENT_MENU', 'TENANT_MENU', 'AI', 'PREMIUM']),
      );
    });

    it('[17] un agent n\'hérite pas des droits du propriétaire', async () => {
      const agentEmail = `agent.${stamp}@itc-test.cg`;
      const created = await post(owner.token, '/admin/users', {
        email: agentEmail,
        password: PASSWORD,
        firstName: 'Agent',
        lastName: 'Test',
        role: 'AGENT',
      });
      expect([200, 201]).toContain(created.status);
      const login = await post(null, '/auth/login', { email: agentEmail, password: PASSWORD });
      expect(login.status).toBe(200);
      agentToken = login.body.data.accessToken;

      expect((await get(agentToken, '/subscription')).status).toBe(403);
      expect((await post(agentToken, '/subscription/checkout', { plan: 'PRO', period: 'MONTHLY' })).status).toBe(403);
      const view = await get(agentToken, '/subscription/status');
      expect(view.status).toBe(200);
      expect(view.body.data.offers).toBeUndefined();
      expect(view.body.data.customerId).toBeUndefined();

      await grant(owner.orgId, 'PRO', until());
      const denied = await get(agentToken, '/buildings');
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', capability: 'AGENT_MENU' });
      expect((await get(owner.token, '/buildings')).status).toBe(200);
    });

    it('[19] routes protégées même appelées directement', async () => {
      expect((await get(null, '/buildings')).status).toBe(401);
      expect((await get(null, '/subscription')).status).toBe(401);
      expect((await post(owner.token, '/subscription/reactivate')).status).toBe(404);
      const forced = await post(owner.token, '/subscription/change-plan', { plan: 'PRO_MAX', period: 'MONTHLY' });
      expect(forced.status).toBeGreaterThanOrEqual(400);
      expect((await activeSub(owner.orgId)).plan).toBe(SubscriptionPlan.PRO);
      expect((await get(owner.token, '/ai/analysis-types')).status).toBe(403);
    });

    it('[18] isolation : aucune action sur l\'abonnement d\'une autre organisation', async () => {
      const other = await register(`autre.org.${stamp}@itc-test.cg`);
      const res = await post(owner.token, `/platform/organizations/${other.orgId}/subscription/grant`, {
        plan: 'PRO_MAX',
        until: until().toISOString(),
        reason: 'tentative',
      });
      expect(res.status).toBe(403);
      expect((await activeSub(other.orgId)).plan).toBe(SubscriptionPlan.STANDARD);
      const mine = await get(owner.token, '/subscription');
      expect(mine.body.data.subscription.organizationId).toBe(owner.orgId);
    });
  });

  // ─── Paiement Stripe ───────────────────────────────────────────────────────

  describe('Paiement Stripe (webhook signé)', () => {
    const real = new Stripe('sk_test_itc_fake_key_for_tests', { apiVersion: '2025-02-24.acacia' });
    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const remote = new Map<string, Stripe.Subscription>();
    let networkDown = false;
    const checkoutRequests: Stripe.Checkout.SessionCreateParams[] = [];
    let owner: Account;
    const subId = `sub_test_${stamp}`;
    const sec = (d: number) => Math.floor(d / 1000);
    let periodStart: number;
    let periodEnd: number;

    function stripeSub(over: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
      return {
        id: subId,
        object: 'subscription',
        status: 'active',
        customer: `cus_test_${stamp}`,
        metadata: { organizationId: owner.orgId },
        items: { object: 'list', data: [{ id: 'si_test', price: { id: 'price_test_plus_monthly' } }] },
        current_period_start: sec(periodStart),
        current_period_end: sec(periodEnd),
        cancel_at_period_end: false,
        canceled_at: null,
        schedule: null,
        ...over,
      } as unknown as Stripe.Subscription;
    }

    function send(id: string, type: string, object: Record<string, unknown>, signature?: string) {
      const payload = JSON.stringify({ id, object: 'event', type, data: { object }, livemode: false, created: sec(Date.now()) });
      return request(app)
        .post(`${API}/subscription/stripe/webhook`)
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature ?? real.webhooks.generateTestHeaderString({ payload, secret }))
        .send(payload);
    }

    beforeAll(async () => {
      clk.set(Date.now());
      owner = await register(`stripe.${stamp}@itc-test.cg`);
      periodStart = clk.now().getTime();
      periodEnd = periodStart + 30 * 24 * H;
      setStripeClient({
        webhooks: real.webhooks,
        customers: { create: async () => ({ id: `cus_test_${stamp}` }) },
        checkout: {
          sessions: {
            create: async (params: Stripe.Checkout.SessionCreateParams) => {
              checkoutRequests.push(params);
              return { id: `cs_test_${stamp}`, url: 'https://checkout.stripe.com/c/pay/cs_test' };
            },
          },
        },
        subscriptions: {
          retrieve: async (id: string) => {
            if (networkDown) throw new Error('connect ECONNRESET api.stripe.com');
            const found = remote.get(id);
            if (!found) throw new Error(`No such subscription: ${id}`);
            return found;
          },
        },
      } as unknown as Stripe);
    });

    it('[12][22] sans identifiant de prix Stripe, l\'offre n\'est pas achetable', async () => {
      const savedId = env.STRIPE_PRICE_PRO_ANNUAL;
      env.STRIPE_PRICE_PRO_ANNUAL = undefined;
      try {
        const checkout = await post(owner.token, '/subscription/checkout', { plan: 'PRO', period: 'ANNUAL' });
        expect(checkout.status).toBe(409);
        expect(checkout.body.code).toBe('OFFER_UNAVAILABLE');
      } finally {
        env.STRIPE_PRICE_PRO_ANNUAL = savedId;
      }
      expect(checkoutRequests).toHaveLength(0);
    });

    it('[12][22] la demande de paiement utilise le prix Stripe de l\'offre et n\'active rien', async () => {
      const offers = await get(owner.token, '/subscription/plans');
      expect(offers.body.data.offers).toContainEqual(
        expect.objectContaining({ plan: 'PLUS', period: 'MONTHLY', amount: 122, currency: 'EUR', available: true }),
      );
      const checkout = await post(owner.token, '/subscription/checkout', { plan: 'PLUS', period: 'MONTHLY' });
      expect(checkout.status).toBe(200);
      expect(checkout.body.data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      expect(checkoutRequests).toHaveLength(1);
      expect(checkoutRequests[0]).toMatchObject({
        mode: 'subscription',
        customer: `cus_test_${stamp}`,
        line_items: [{ price: 'price_test_plus_monthly', quantity: 1 }],
        metadata: { organizationId: owner.orgId, plan: 'PLUS', period: 'MONTHLY' },
      });
      const back = await request(app).get('/billing/return?status=success');
      expect(back.status).toBe(200);
      const sub = await activeSub(owner.orgId);
      expect(sub.plan).toBe(SubscriptionPlan.STANDARD);
      expect(sub.status).toBe(SubscriptionStatus.TRIALING);
    });

    it('[19] signature invalide refusée, rien n\'est enregistré', async () => {
      const res = await send(`evt_bad_${stamp}`, 'invoice.paid', { subscription: subId }, 't=1,v1=deadbeef');
      expect(res.status).toBe(400);
      expect(await prisma.paymentProviderEvent.count({ where: { eventId: `evt_bad_${stamp}` } })).toBe(0);
    });

    it('[12] session terminée sans paiement confirmé : ignorée', async () => {
      remote.set(subId, stripeSub({ status: 'incomplete' }));
      const res = await send(`evt_unpaid_${stamp}`, 'checkout.session.completed', {
        mode: 'subscription',
        subscription: subId,
        payment_status: 'unpaid',
        client_reference_id: owner.orgId,
      });
      expect(res.body.outcome).toBe('IGNORED');
      expect((await activeSub(owner.orgId)).plan).toBe(SubscriptionPlan.STANDARD);
    });

    it('[12][11] paiement confirmé : Plus mensuel activé', async () => {
      remote.set(subId, stripeSub());
      const res = await send(`evt_paid_${stamp}`, 'checkout.session.completed', {
        mode: 'subscription',
        subscription: subId,
        payment_status: 'paid',
        client_reference_id: owner.orgId,
      });
      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('PROCESSED');
      const sub = await activeSub(owner.orgId);
      expect(sub).toMatchObject({
        plan: SubscriptionPlan.PLUS,
        status: SubscriptionStatus.ACTIVE,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentProvider: 'stripe',
        externalSubscriptionId: subId,
      });
      expect(sub.currentPeriodEnd!.getTime()).toBe(sec(periodEnd) * 1000);
      expect((await get(owner.token, '/maintenance/agents')).status).toBe(200);
    });

    it('[21] événement en double (y compris simultané) : traité une seule fois', async () => {
      const again = await send(`evt_paid_${stamp}`, 'checkout.session.completed', {
        mode: 'subscription',
        subscription: subId,
        payment_status: 'paid',
        client_reference_id: owner.orgId,
      });
      expect(again.body.outcome).toBe('DUPLICATE');

      const twin = { subscription: subId, billing_reason: 'subscription_create', id: 'in_twin' };
      const [a, b] = await Promise.all([
        send(`evt_twin_${stamp}`, 'invoice.paid', twin),
        send(`evt_twin_${stamp}`, 'invoice.paid', twin),
      ]);
      expect([a.body.outcome, b.body.outcome].sort()).toEqual(['DUPLICATE', 'PROCESSED']);
      const activated = await prisma.subscriptionEvent.count({
        where: { organizationId: owner.orgId, type: 'ACTIVATED', externalRef: { in: [`evt_paid_${stamp}`, `evt_twin_${stamp}`] } },
      });
      expect(activated).toBe(2);
    });

    it('[21] erreur réseau : événement en échec puis retraité à la relivraison', async () => {
      networkDown = true;
      const failed = await send(`evt_net_${stamp}`, 'customer.subscription.updated', { id: subId });
      expect(failed.status).toBe(500);
      expect((await prisma.paymentProviderEvent.findFirstOrThrow({ where: { eventId: `evt_net_${stamp}` } })).status).toBe('FAILED');
      networkDown = false;
      const retried = await send(`evt_net_${stamp}`, 'customer.subscription.updated', { id: subId });
      expect(retried.body.outcome).toBe('PROCESSED');
    });

    it('[11] montée vers Pro Max annuel', async () => {
      remote.set(subId, stripeSub({ items: { object: 'list', data: [{ id: 'si_test', price: { id: 'price_test_pro_max_annual' } }] } }));
      const res = await send(`evt_upgrade_${stamp}`, 'invoice.paid', { subscription: subId, billing_reason: 'subscription_update', id: 'in_up' });
      expect(res.body.outcome).toBe('PROCESSED');
      const sub = await activeSub(owner.orgId);
      expect(sub.plan).toBe(SubscriptionPlan.PRO_MAX);
      expect(sub.billingPeriod).toBe(BillingPeriod.ANNUAL);
      expect((await get(owner.token, '/ai/analysis-types')).status).toBe(200);
    });

    it('[13] paiement échoué : accès jusqu\'à la fin de la période, puis blocage', async () => {
      remote.set(subId, stripeSub({ status: 'past_due', items: { object: 'list', data: [{ id: 'si_test', price: { id: 'price_test_pro_max_annual' } }] } }));
      await send(`evt_fail_${stamp}`, 'invoice.payment_failed', { subscription: subId, id: 'in_fail', attempt_count: 1 });
      expect((await activeSub(owner.orgId)).status).toBe(SubscriptionStatus.PAST_DUE);

      clk.set(periodEnd - 1000);
      expect((await get(owner.token, '/buildings')).status).toBe(200);
      clk.set(periodEnd);
      const blocked = await get(owner.token, '/buildings');
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('SUBSCRIPTION_PAST_DUE');
      expect((await get(owner.token, '/subscription')).status).toBe(200);
    });

    it('[13] renouvellement payé : accès rétabli ; un ancien événement arrivé en retard ne le défait pas', async () => {
      periodStart = periodEnd;
      periodEnd = periodStart + 365 * 24 * H;
      const renewed = () => stripeSub({ items: { object: 'list', data: [{ id: 'si_test', price: { id: 'price_test_pro_max_annual' } }] } });
      remote.set(subId, renewed());
      const res = await send(`evt_renew_${stamp}`, 'invoice.paid', { subscription: subId, billing_reason: 'subscription_cycle', id: 'in_renew' });
      expect(res.body.outcome).toBe('PROCESSED');
      expect((await get(owner.token, '/buildings')).status).toBe(200);

      const late = await send(`evt_late_fail_${stamp}`, 'invoice.payment_failed', { subscription: subId, id: 'in_old', attempt_count: 2 });
      expect(late.body.outcome).toBe('PROCESSED');
      expect((await activeSub(owner.orgId)).status).toBe(SubscriptionStatus.ACTIVE);
      const types = (await prisma.subscriptionEvent.findMany({ where: { organizationId: owner.orgId }, select: { type: true } })).map((e) => e.type);
      expect(types).toEqual(expect.arrayContaining(['ACTIVATED', 'PLAN_CHANGED', 'PAYMENT_FAILED', 'RENEWED']));
    });

    it('[13] résiliation : active jusqu\'à la fin de période, puis bloquée', async () => {
      const base = { items: { object: 'list', data: [{ id: 'si_test', price: { id: 'price_test_pro_max_annual' } }] } };
      remote.set(subId, stripeSub({ ...base, cancel_at_period_end: true }));
      await send(`evt_cancel_${stamp}`, 'customer.subscription.updated', { id: subId });
      expect((await activeSub(owner.orgId)).cancelAtPeriodEnd).toBe(true);
      expect((await get(owner.token, '/buildings')).status).toBe(200);

      remote.set(subId, stripeSub({ ...base, status: 'canceled', canceled_at: sec(periodEnd) }));
      await send(`evt_deleted_${stamp}`, 'customer.subscription.deleted', { id: subId });
      expect((await activeSub(owner.orgId)).status).toBe(SubscriptionStatus.CANCELLED);
      clk.set(periodEnd);
      const blocked = await get(owner.token, '/buildings');
      expect(blocked.body.code).toBe('SUBSCRIPTION_CANCELLED');
    });
  });

  // ─── Quotas IA ─────────────────────────────────────────────────────────────

  describe('Quotas IA côté serveur', () => {
    const quotas = () => container.resolve(AiQuotaService);
    const original = { ...AI_QUOTAS.PRO_MAX! };
    let owner: Account;
    let other: Account;

    beforeAll(async () => {
      clk.set(Date.now());
      owner = await register(`quota.${stamp}@itc-test.cg`);
      other = await register(`quota.autre.${stamp}@itc-test.cg`);
      const until = new Date(clk.now().getTime() + 30 * 24 * H);
      await grant(owner.orgId, 'PRO_MAX', until);
      await grant(other.orgId, 'PRO_MAX', until);
      AI_QUOTAS.PRO_MAX!.AI_MESSAGE = 3;
    });
    afterAll(() => Object.assign(AI_QUOTAS.PRO_MAX!, original));

    it('[10] 10 demandes simultanées pour une limite de 3 : exactement 3 acceptées', async () => {
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => quotas().reserve(owner.orgId, 'AI_MESSAGE')));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected).toHaveLength(7);
      expect(rejected[0].reason.code).toBe('AI_QUOTA_EXCEEDED');
      const usage = await quotas().usage(owner.orgId);
      expect(usage.find((u) => u.unit === 'AI_MESSAGE')).toMatchObject({ used: 3, limit: 3 });
    });

    it('[10] l\'API refuse au-delà du quota, sans appeler l\'IA', async () => {
      const res = await post(owner.token, '/ai/chat', { message: 'Bonjour' });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'AI_QUOTA_EXCEEDED', unit: 'AI_MESSAGE', limit: 3 });
      const usage = await quotas().usage(owner.orgId);
      expect(usage.find((u) => u.unit === 'AI_MESSAGE')!.used).toBe(3);
    });

    it('[10] une unité réservée puis rendue redevient disponible', async () => {
      const release = await quotas().reserve(other.orgId, 'AI_IMAGE');
      expect((await quotas().usage(other.orgId)).find((u) => u.unit === 'AI_IMAGE')!.used).toBe(1);
      await release();
      expect((await quotas().usage(other.orgId)).find((u) => u.unit === 'AI_IMAGE')!.used).toBe(0);
    });

    it('[10] une opération en échec rend son unité ; les autres organisations ne sont pas touchées', async () => {
      await expect(quotas().run(other.orgId, 'AI_MESSAGE', async () => { throw new Error('panne IA'); })).rejects.toThrow('panne IA');
      const usage = await quotas().usage(other.orgId);
      expect(usage.find((u) => u.unit === 'AI_MESSAGE')!.used).toBe(0);
    });
  });

  // ─── Comptes existants ─────────────────────────────────────────────────────

  describe('Compatibilité avec les comptes existants', () => {
    let owner: Account;
    const script = path.resolve(__dirname, '../../scripts/subscriptions-transition.ts');
    const tsx = path.resolve(__dirname, '../../node_modules/tsx/dist/cli.mjs');
    const run = (...args: string[]) =>
      execFileSync(process.execPath, [tsx, script, ...args], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        encoding: 'utf8',
      });

    beforeAll(async () => {
      clk.set(Date.now());
      owner = await register(`ancien.${stamp}@itc-test.cg`);
      const sub = await activeSub(owner.orgId);
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.ACTIVE,
          paymentProvider: 'manual',
          expiresAt: new Date(Date.now() + 10 * 24 * H),
          trialStartedAt: null,
          trialEndsAt: null,
        },
      });
    });

    it('[20] un compte de l\'ancien modèle garde tout (Pro Max) jusqu\'à son échéance', async () => {
      expect((await get(owner.token, '/ai/analysis-types')).status).toBe(200);
      expect((await get(owner.token, '/maintenance/agents')).status).toBe(200);
    });

    it('[20] script de transition : rapport sans écriture, application idempotente, retour arrière', async () => {
      const report = run();
      expect(report).toContain('RAPPORT SEUL');
      expect((await activeSub(owner.orgId)).paymentProvider).toBe('manual');

      run('--apply');
      let sub = await activeSub(owner.orgId);
      expect(sub).toMatchObject({ plan: 'PRO_MAX', paymentProvider: 'legacy', legacyPlan: 'STARTER', status: 'ACTIVE' });
      expect((await get(owner.token, '/ai/analysis-types')).status).toBe(200);

      expect(run('--apply')).toContain('DEJA_MIGRE');
      expect(await prisma.subscriptionEvent.count({ where: { organizationId: owner.orgId, type: 'MIGRATED' } })).toBe(1);

      run('--rollback', '--apply');
      sub = await activeSub(owner.orgId);
      expect(sub).toMatchObject({ plan: 'STARTER', paymentProvider: 'manual', legacyPlan: null, status: 'ACTIVE' });
      expect(await prisma.trialClaim.count({ where: { source: 'migration' } })).toBe(0);
    }, 120_000);
  });
});
