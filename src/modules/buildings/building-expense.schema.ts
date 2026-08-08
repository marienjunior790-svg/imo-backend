import { z } from 'zod';
import { ExpenseCategory } from '@prisma/client';

export const createExpenseSchema = z.object({
  amount: z.coerce.number().int().positive(),
  category: z.nativeEnum(ExpenseCategory).default(ExpenseCategory.OTHER),
  incurredAt: z.string().min(1),
  description: z.string().max(2000).optional(),
  vendor: z.string().max(200).optional(),
  apartmentId: z.string().optional(),
  maintenanceTicketId: z.string().optional(),
  currency: z.string().default('XAF'),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;
