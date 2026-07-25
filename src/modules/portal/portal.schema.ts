import { z } from 'zod';

export const portalMaintenanceSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  apartmentId: z.string().optional(),
});

export const portalMaintenanceCommentSchema = z.object({
  message: z.string().min(1, 'Message requis').max(1000),
});
