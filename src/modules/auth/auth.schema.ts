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
  /** Optionnel — un seul type d’inscription produit. Défaut AGENCY. */
  organizationType: z.enum(['AGENCY', 'OWNER']).optional().default('AGENCY'),
  onboarding: onboardingSchema.optional(),
});

export const loginSchema = z
  .object({
    /** @deprecated préférer `identifier` — conservé pour D11 */
    email: z.string().optional(),
    identifier: z.string().optional(),
    password: z.string().min(1, 'Mot de passe requis'),
    mfaCode: z.string().min(6).max(64).optional(),
  })
  .superRefine((val, ctx) => {
    const id = (val.identifier ?? val.email ?? '').trim();
    if (!id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Identifiant requis', path: ['identifier'] });
    }
  })
  .transform((val) => ({
    identifier: (val.identifier ?? val.email ?? '').trim(),
    password: val.password,
    mfaCode: val.mfaCode,
    /** compat champs legacy */
    email: (val.identifier ?? val.email ?? '').trim(),
  }));

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

/** Mise à jour profil compte (self-service). E-mail / rôle non modifiables ici. */
export const updateProfileSchema = z.object({
  firstName: z.string().min(2, 'Prénom requis (min. 2 caractères)').max(80).optional(),
  lastName: z.string().min(2, 'Nom requis (min. 2 caractères)').max(80).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
  address: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
  identityDocument: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
  emailNotificationsEnabled: z.boolean().optional(),
  pushNotificationsEnabled: z.boolean().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;