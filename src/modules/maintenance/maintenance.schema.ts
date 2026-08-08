import { z } from 'zod';
import { MaintenancePriority, MaintenanceTicketStatus } from '@prisma/client';

export const createMaintenanceSchema = z.object({
  apartmentId: z.string().min(1),
  tenantId: z.string().optional(),
  leaseId: z.string().optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
});

export const updateMaintenanceSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
});

export const assignMaintenanceSchema = z.object({
  assignedToId: z.string().optional(),
  assignedToName: z.string().min(2).max(120).optional(),
  note: z.string().max(500).optional(),
}).refine((d) => d.assignedToId || d.assignedToName, {
  message: 'Indiquez un technicien (utilisateur ou nom)',
});

export const maintenanceListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.nativeEnum(MaintenanceTicketStatus).optional(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
  apartmentId: z.string().optional(),
  buildingId: z.string().optional(),
});

export const addNoteSchema = z.object({
  message: z.string().min(1).max(500),
});
