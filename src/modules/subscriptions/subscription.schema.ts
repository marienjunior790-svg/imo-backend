import { z } from 'zod';
import { BillingPeriod } from '@prisma/client';
import { PAID_PLANS } from './plans.config.js';

const paidPlan = z.enum(PAID_PLANS as unknown as [string, ...string[]]);

export const checkoutSchema = z.object({
  plan: paidPlan,
  period: z.nativeEnum(BillingPeriod),
});

export const changePlanSchema = checkoutSchema;

export const adminGrantSchema = z.object({
  plan: paidPlan,
  until: z.coerce.date(),
  reason: z.string().trim().min(3).max(300),
});

export type CheckoutDto = z.infer<typeof checkoutSchema>;
export type AdminGrantDto = z.infer<typeof adminGrantSchema>;
