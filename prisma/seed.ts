/**
 * IMMO-tec — Catalogue système uniquement (fonctionnalités + RBAC).
 * Les utilisateurs se créent via inscription ou administration.
 * Exécution : npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import { FEATURE_CATALOG } from '../src/shared/constants/feature-keys.js';
import { PERMISSION_CATALOG } from '../src/shared/rbac/permission-catalog.js';
import { ROLE_PERMISSION_MATRIX } from '../src/shared/rbac/role-matrix.js';

const prisma = new PrismaClient();

async function seedRbac() {
  for (const def of PERMISSION_CATALOG) {
    await prisma.rbacPermission.upsert({
      where: { key: def.key },
      update: { label: def.label, category: def.category, module: def.module, description: def.description },
      create: {
        key: def.key,
        label: def.label,
        category: def.category,
        module: def.module,
        description: def.description,
      },
    });
  }

  for (const [role, perms] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const keys = perms === 'ALL' ? PERMISSION_CATALOG.map((p) => p.key) : perms;
    for (const key of keys) {
      await prisma.rbacRolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey: key } },
        update: {},
        create: { role, permissionKey: key },
      });
    }
  }
  console.log(`✅ ${PERMISSION_CATALOG.length} permissions RBAC initialisées`);
}

async function main() {
  console.log('🌱 Seed IMMO-tec — catalogue système...\n');

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

  console.log(`✅ ${FEATURE_CATALOG.length} fonctionnalités catalogue initialisées`);
  await seedRbac();
  console.log('ℹ️  Comptes utilisateurs : inscription mobile ou administration plateforme.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
