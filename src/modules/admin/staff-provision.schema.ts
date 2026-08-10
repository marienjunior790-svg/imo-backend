import { z } from 'zod';

export const staffProvisionSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : undefined;
    })
    .superRefine((v, ctx) => {
      if (v !== undefined && v.replace(/\D/g, '').length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Téléphone invalide (8 chiffres min.)',
        });
      }
    }),
  email: z
    .string()
    .email()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  role: z.enum(['AGENT', 'MANAGER', 'ACCOUNTANT']).default('MANAGER'),
});

export type StaffProvisionDto = z.infer<typeof staffProvisionSchema>;
