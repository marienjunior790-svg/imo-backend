import 'reflect-metadata';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { PrismaService } from './infrastructure/prisma/prisma.service.js';
import { RbacService } from './shared/rbac/rbac.service.js';
import { bootstrapSuperAdmin, seedFeatureCatalog } from './bootstrap/system-bootstrap.js';
import { initSentry } from './infrastructure/monitoring/sentry.js';
import { container } from 'tsyringe';

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

  const shutdown = async () => {
    await prisma.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Erreur au démarrage :', err);
  process.exit(1);
});
