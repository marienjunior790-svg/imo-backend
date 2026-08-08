import { z } from 'zod';
import { PaymentStatus, PaymentMethod } from '@prisma/client';

export const createPaymentSchema = z.object({
  leaseId: z.string().min(1),
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodYear: z.coerce.number().int().min(2020),
  amount: z.coerce.number().int().positive().optional(),
  dueDate: z.string().optional(),
});

export const recordPaymentSchema = z.object({
  amountPaid: z.coerce.number().int().positive(),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.string().optional(),
});

export const paymentListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  leaseId: z.string().optional(),
  buildingId: z.string().optional(),
  apartmentId: z.string().optional(),
});

export const mobileMoneyWebhookSchema = z.object({
  reference: z.string().min(4),
  amountPaid: z.coerce.number().int().positive(),
  provider: z.string().optional(),
});
