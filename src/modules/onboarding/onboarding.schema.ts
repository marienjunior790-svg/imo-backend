import { z } from 'zod';

export const ONBOARDING_STEP_KEYS = [
  'welcome',
  'first_property',
  'invite_collaborator',
  'org_branding',
  'invite_tenant',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingStepStatus = 'pending' | 'done' | 'skipped';

export type OnboardingStep = {
  key: OnboardingStepKey;
  status: OnboardingStepStatus;
  required: boolean;
};

export type OrganizationOnboarding = {
  version: 1;
  steps: OnboardingStep[];
  completedAt: string | null;
};

export const firstPropertyBodySchema = z.object({
  name: z.string().min(2, 'Nom du bien requis'),
  address: z.string().min(3, 'Adresse requise'),
  district: z.string().optional(),
  city: z.string().optional(),
  doorCount: z.coerce.number().int().min(1).max(200).optional(),
  defaultRentAmount: z.coerce.number().int().min(0).optional(),
});

export const completeStepBodySchema = z.object({
  skipped: z.boolean().optional(),
  /** Alias branding léger (étape org_branding) */
  logoUrl: z.string().url().optional().nullable(),
  displayName: z.string().min(2).optional(),
});

export type FirstPropertyBody = z.infer<typeof firstPropertyBodySchema>;
export type CompleteStepBody = z.infer<typeof completeStepBodySchema>;
