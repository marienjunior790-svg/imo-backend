import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Minimum 8 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule requise')
  .regex(/[a-z]/, 'Au moins une minuscule requise')
  .regex(/[0-9]/, 'Au moins un chiffre requis');

export const onboardingSchema = z.object({
  buildingName: z.string().min(2, 'Nom du bien requis'),
  buildingAddress: z.string().min(3, 'Adresse requise'),
  district: z.string().optional(),
  doorCount: z.number().int().min(1, 'Au moins 1 porte').max(200),
  defaultRentAmount: z.number().int().min(0, 'Montant invalide'),
  tenantCount: z.number().int().min(0).optional(),
});

export const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: passwordSchema,
  firstName: z.string().min(2, 'Prénom requis (min. 2 caractères)'),
  lastName: z.string().min(2, 'Nom requis (min. 2 caractères)'),
  phone: z.string().optional(),
  organizationName: z.string().min(2, 'Nom d\'organisation requis'),
  organizationType: z.enum(['AGENCY', 'OWNER']),
  onboarding: onboardingSchema.optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  mfaCode: z.string().min(6).max(64).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = refreshSchema;

export const registerTenantSchema = z.object({
  email: z.string().email('Email invalide'),
  password: passwordSchema,
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().min(8),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: passwordSchema,
});

export const mfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres'),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
