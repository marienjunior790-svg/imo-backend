import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Minimum 8 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule requise')
  .regex(/[a-z]/, 'Au moins une minuscule requise')
  .regex(/[0-9]/, 'Au moins un chiffre requis');

export const createOrgUserSchema = z.object({
  email: z.string().email('Email invalide'),
  /** @deprecated P2 — préférer POST /invitations (le collaborateur définit son mot de passe). */
  password: passwordSchema,
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(['AGENT', 'TENANT', 'TECHNICIAN']).default('AGENT'),
});

export const updateOrgUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['AGENT', 'TENANT', 'TECHNICIAN']).optional(),
  proAccessEnabled: z.boolean().optional(),
});
