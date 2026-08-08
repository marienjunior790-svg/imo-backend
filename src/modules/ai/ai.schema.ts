import { z } from 'zod';

export const aiChatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
  /** Corrige fautes / « faux mots » avant traitement */
  normalizeText: z.boolean().optional(),
});

export const aiAnalyzeSchema = z.object({
  analysisType: z.enum(['overview', 'revenue', 'occupancy', 'delinquency']).default('overview'),
});

export const aiContractSchema = z.object({
  leaseId: z.string().min(1).optional(),
});

export const aiNormalizeSchema = z.object({
  text: z.string().min(1).max(4000),
});

export const aiActionConfirmSchema = z.object({
  actionId: z.string().uuid(),
});

export const aiSpeakSchema = z.object({
  text: z.string().min(1).max(3500),
});

export type AiChatDto = z.infer<typeof aiChatSchema>;
export type AiAnalyzeDto = z.infer<typeof aiAnalyzeSchema>;
export type AiContractDto = z.infer<typeof aiContractSchema>;
export type AiNormalizeDto = z.infer<typeof aiNormalizeSchema>;
export type AiActionConfirmDto = z.infer<typeof aiActionConfirmSchema>;
export type AiSpeakDto = z.infer<typeof aiSpeakSchema>;
