import { z } from 'zod';

export const marketStatsQuerySchema = z.object({
  city: z.string().min(1).max(80).optional(),
  district: z.string().min(1).max(80).optional(),
  currency: z.string().min(3).max(8).optional(),
});

export const marketStatsOptInSchema = z.object({
  enabled: z.boolean(),
});

export const matchDemandSchema = z.object({
  maxRent: z.number().int().positive().optional(),
  minRent: z.number().int().nonnegative().optional(),
  minRooms: z.number().int().positive().max(20).optional(),
  minSurface: z.number().positive().max(10_000).optional(),
  cities: z.array(z.string().min(1).max(80)).max(20).optional(),
  districts: z.array(z.string().min(1).max(80)).max(20).optional(),
  preferredDistricts: z.array(z.string().min(1).max(80)).max(20).optional(),
  excludedDistricts: z.array(z.string().min(1).max(80)).max(20).optional(),
  currency: z.string().min(3).max(8).optional(),
  locale: z.string().min(2).max(16).optional(),
  text: z.string().max(2000).optional(),
  weights: z
    .object({
      price: z.number().min(0).max(1).optional(),
      rooms: z.number().min(0).max(1).optional(),
      location: z.number().min(0).max(1).optional(),
      surface: z.number().min(0).max(1).optional(),
      quality: z.number().min(0).max(1).optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
