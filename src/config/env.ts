import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  DEFAULT_CURRENCY: z.string().default('XAF'),
  DEFAULT_CITY: z.string().default('Brazzaville'),
  DEFAULT_COUNTRY: z.string().default('CG'),
  // n8n Automation
  N8N_ENABLED: z.coerce.boolean().default(false),
  N8N_WEBHOOK_BASE_URL: z.string().url().optional(),
  N8N_API_KEY: z.string().min(16).optional(),
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  AI_MAX_HISTORY: z.coerce.number().default(10),
  // CORS (production) — origines séparées par des virgules (obligatoire si frontend web)
  // CORS_ORIGINS=https://app.example.com,https://admin.example.com
  CORS_ORIGINS: z.string().optional(),
  // URL publique affichée au démarrage (Railway : https://xxx.up.railway.app)
  PUBLIC_API_URL: z.string().url().optional(),
  // Premier super-admin (une seule fois, si aucun SUPER_ADMIN en base)
  BOOTSTRAP_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
  // Monitoring (optionnel)
  SENTRY_DSN: z.string().url().optional(),
  // Cache IA (ms)
  AI_CONTEXT_CACHE_TTL_MS: z.coerce.number().default(60_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables d\'environnement invalides:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

export const isN8nConfigured = Boolean(
  env.N8N_ENABLED && env.N8N_WEBHOOK_BASE_URL,
);

export const isAutomationApiConfigured = Boolean(env.N8N_API_KEY);

export const isOpenAiConfigured = Boolean(env.OPENAI_API_KEY);

export const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : undefined;

const DEV_JWT_MARKERS = ['immo-tec-dev-access-secret', 'immo-tec-dev-refresh-secret', 'change-me-production'];

if (env.NODE_ENV === 'production') {
  const weakJwt =
    DEV_JWT_MARKERS.some((m) => env.JWT_ACCESS_SECRET.includes(m)) ||
    DEV_JWT_MARKERS.some((m) => env.JWT_REFRESH_SECRET.includes(m));
  if (weakJwt) {
    console.error('❌ JWT_ACCESS_SECRET / JWT_REFRESH_SECRET : utilisez des secrets aléatoires en production (Railway Variables).');
    process.exit(1);
  }
  if (!isCloudinaryConfigured) {
    // Ne bloque plus le boot : les uploads échoueront déjà via CloudinaryService.
    // Un exit(1) ici empêche tout redeploy RC si les variables manquent sur Railway.
    console.error(
      '⚠️  Cloudinary non configuré (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET). Uploads images/PDF indisponibles jusqu’à configuration.',
    );
  }
  if (!env.DATABASE_URL.includes('sslmode=') && !env.DATABASE_URL.includes('ssl=true')) {
    console.warn('⚠️  DATABASE_URL sans SSL explicite — Neon/Railway/Supabase recommandent ?sslmode=require');
  }
}
