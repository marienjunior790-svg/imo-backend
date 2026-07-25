import { z } from 'zod';

export const agentCommentSchema = z.object({
  message: z.string().min(1, 'Commentaire requis').max(1000),
});

export const agentPhotoSchema = z.object({
  phase: z.enum(['BEFORE', 'AFTER']),
});

export const agentRefuseSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type AgentCommentInput = z.infer<typeof agentCommentSchema>;
export type AgentPhotoInput = z.infer<typeof agentPhotoSchema>;
export type AgentRefuseInput = z.infer<typeof agentRefuseSchema>;
