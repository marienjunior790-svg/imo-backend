import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Minimum 8 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule requise')
  .regex(/[a-z]/, 'Au moins une minuscule requise')
  .regex(/[0-9]/, 'Au moins un chiffre requis');

export const inviteRoles = ['AGENT', 'TECHNICIAN', 'TENANT', 'MANAGER', 'ACCOUNTANT'] as const;

export const createInvitationSchema = z.object({
  email: z.string().email('Email invalide'),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(inviteRoles).default('AGENT'),
});

export const acceptInvitationSchema = z.object({
  password: passwordSchema,
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
