import 'reflect-metadata';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { PrismaService } from './infrastructure/prisma/prisma.service.js';
import { RbacService } from './shared/rbac/rbac.service.js';
import { bootstrapSuperAdmin, seedFeatureCatalog } from './bootstrap/system-bootstrap.js';
import { initSentry } from './infrastructure/monitoring/sentry.js';
import { container } from 'tsyringe';
import { RentFollowUpService } from './modules/rent-followup/rent-followup.service.js';

async function bootstrap() {
  initSentry();

  const prisma = container.resolve(PrismaService);
  await prisma.connect();

  await seedFeatureCatalog(prisma).catch((err) => console.warn('Catalogue fonctionnalités:', err?.message ?? err));

  const rbac = container.resolve(RbacService);
  await rbac.seed().catch((err) => console.warn('RBAC seed:', err?.message ?? err));

  await bootstrapSuperAdmin(prisma).catch((err) => console.warn('Bootstrap super-admin:', err?.message ?? err));

  const app = createApp();

  app.listen(env.PORT, '0.0.0.0', () => {
    const publicUrl = env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`;
    console.log(`\n🏠 IMMO-tec API`);
    console.log(`   Environnement : ${env.NODE_ENV}`);
    console.log(`   URL           : ${publicUrl}${env.API_PREFIX}`);
    console.log(`   Health        : ${publicUrl}${env.API_PREFIX}/health\n`);
  });

  const followUpTimer = startRentFollowUpScheduler();

  const shutdown = async () => {
    if (followUpTimer) clearInterval(followUpTimer);
    await prisma.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Suivi des loyers sans dépendre d'un cron externe : échéances du mois, retards, rappels et relances.
 * Chaque étape est idempotente (échéance unique par contrat/mois, relance journalisée), donc
 * plusieurs passages par jour ou plusieurs instances ne créent pas de doublons.
 */
function startRentFollowUpScheduler(): NodeJS.Timeout | null {
  if (env.NODE_ENV === 'test' || process.env.RENT_FOLLOW_UP_SCHEDULER === 'off') return null;

  const everyMs = 6 * 60 * 60 * 1000;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await container.resolve(RentFollowUpService).runDailyFollowUp();
      console.log('[rent-follow-up]', JSON.stringify(result));
    } catch (err) {
      console.warn('[rent-follow-up] échec:', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  setTimeout(run, 60 * 1000);
  return setInterval(run, everyMs);
}

bootstrap().catch((err) => {
  console.error('Erreur au démarrage :', err);
  process.exit(1);
});
