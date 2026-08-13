import { SubscriptionPlan } from '@prisma/client';
import { getPlanLimits, PLAN_LIMITS, GRACE_PERIOD_DAYS } from '../../src/shared/constants/plan-limits.js';

describe('Plan limits SaaS', () => {
  it('STARTER limite à 10 biens et 1 utilisateur', () => {
    const limits = getPlanLimits(SubscriptionPlan.STARTER);
    expect(limits.maxApartments).toBe(10);
    expect(limits.maxUsers).toBe(1);
    expect(limits.pdfPaymentReceipt).toBe(false);
    expect(limits.aiAssistant).toBe(true);
  });

  it('PRO autorise IA et PDF quittances', () => {
    const limits = getPlanLimits(SubscriptionPlan.PRO);
    expect(limits.maxApartments).toBe(Infinity);
    expect(limits.aiAssistant).toBe(true);
    expect(limits.pdfPaymentReceipt).toBe(true);
  });

  it('ENTERPRISE inclut analytics et IA', () => {
    const limits = getPlanLimits(SubscriptionPlan.ENTERPRISE);
    expect(limits.analytics).toBe(true);
    expect(limits.aiAssistant).toBe(true);
  });

  it('définit un catalogue pour chaque plan', () => {
    expect(Object.keys(PLAN_LIMITS)).toHaveLength(3);
    expect(GRACE_PERIOD_DAYS).toBeGreaterThan(0);
  });
});
