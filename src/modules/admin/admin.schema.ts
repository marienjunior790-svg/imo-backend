import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Minimum 8 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule requise')
  .regex(/[a-z]/, 'Au moins une minuscule requise')
  .regex(/[0-9]/, 'Au moins un chiffre requis');

/** Rôles qu'un propriétaire peut attribuer dans son organisation (OWNER exclu). */
export const orgAssignableRoles = ['MANAGER', 'AGENT', 'ACCOUNTANT', 'TENANT'] as const;

export const createOrgUserSchema = z.object({
  email: z.string().email('Email invalide'),
  /** @deprecated P2 — préférer POST /invitations (le collaborateur définit son mot de passe). */
  password: passwordSchema,
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(orgAssignableRoles).default('MANAGER'),
});

export const updateOrgUserSchema = z.object({
  firstName: z.string().min(2).max(80).optional(),
  lastName: z.string().min(2).max(80).optional(),
  phone: z.string().min(8).max(30).optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  isActive: z.boolean().optional(),
  role: z.enum(orgAssignableRoles).optional(),
  proAccessEnabled: z.boolean().optional(),
});
