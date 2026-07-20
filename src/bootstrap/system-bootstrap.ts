import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import type { PrismaService } from '../infrastructure/prisma/prisma.service.js';
import { FEATURE_CATALOG } from '../shared/constants/feature-keys.js';
import { env } from '../config/env.js';

export async function seedFeatureCatalog(prisma: PrismaService): Promise<void> {
  for (const item of FEATURE_CATALOG) {
    await prisma.feature.upsert({
      where: { key: item.key },
      update: { label: item.label, description: item.description, category: item.category },
      create: {
        key: item.key,
        label: item.label,
        description: item.description,
        category: item.category,
        defaultEnabled: true,
      },
    });
  }
}

/** Crée le super-admin initial uniquement si aucun n'existe (variables Railway). */
export async function bootstrapSuperAdmin(prisma: PrismaService): Promise<void> {
  const email = env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
    select: { id: true },
  });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Administrateur',
      lastName: 'Plateforme',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log('✅ Super administrateur plateforme initialisé');
}
