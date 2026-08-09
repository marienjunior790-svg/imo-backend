import { z } from 'zod';

export const staffProvisionSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().min(8).optional(),
  email: z.string().email().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  role: z.enum(['AGENT', 'MANAGER', 'ACCOUNTANT']).default('AGENT'),
});

export type StaffProvisionDto = z.infer<typeof staffProvisionSchema>;
