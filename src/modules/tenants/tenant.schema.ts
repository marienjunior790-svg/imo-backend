import { z } from 'zod';

export const createTenantSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  idNumber: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const tenantListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
});

const onboardLeaseSchema = z.object({
  apartmentId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  monthlyRent: z.coerce.number().int().positive().optional(),
  depositAmount: z.coerce.number().int().nonnegative().optional(),
  terms: z.string().optional(),
  activate: z.boolean().optional(),
});

/** Création complète : CRM + contrat optionnel + compte portail */
export const onboardTenantSchema = createTenantSchema.extend({
  lease: onboardLeaseSchema.optional(),
  provisionPortal: z.boolean().optional(),
});
