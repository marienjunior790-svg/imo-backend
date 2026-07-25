import { inject, injectable } from 'tsyringe';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError } from '../errors/app.error.js';
import { normalizeRole } from '../auth/roles.js';
import { PERMISSION_CATALOG } from './permission-catalog.js';
import { ROLE_PERMISSION_MATRIX, resolveRolePermissions } from './role-matrix.js';

@injectable()
export class RbacService {
  private cache = new Map<string, { keys: Set<string>; expires: number }>();
  private readonly TTL_MS = 5 * 60 * 1000;

  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async seed(): Promise<void> {
    for (const def of PERMISSION_CATALOG) {
      await this.prisma.rbacPermission.upsert({
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
        await this.prisma.rbacRolePermission.upsert({
          where: { role_permissionKey: { role, permissionKey: key } },
          update: {},
          create: { role, permissionKey: key },
        });
      }
      // Réconciliation : un rôle qui change de métier (P6 : AGENT → maintenance)
      // doit perdre ses anciens octrois, sinon la matrice en base reste permissive.
      await this.prisma.rbacRolePermission.deleteMany({
        where: { role, permissionKey: { notIn: keys } },
      });
    }
    this.cache.clear();
  }

  async getPermissionsForRole(roleInput: string): Promise<string[]> {
    const role = normalizeRole(roleInput);
    if (role === UserRole.SUPER_ADMIN) return PERMISSION_CATALOG.map((p) => p.key);

    const cached = this.cache.get(role);
    if (cached && cached.expires > Date.now()) {
      return [...cached.keys];
    }

    const rows = await this.prisma.rbacRolePermission.findMany({
      where: { role, permission: { isActive: true } },
      select: { permissionKey: true },
    });

    let keys: string[];
    if (rows.length === 0) {
      keys = resolveRolePermissions(role);
    } else {
      keys = rows.map((r) => r.permissionKey);
    }

    this.cache.set(role, { keys: new Set(keys), expires: Date.now() + this.TTL_MS });
    return keys;
  }

  async hasPermission(role: string, permission: string): Promise<boolean> {
    if (normalizeRole(role) === UserRole.SUPER_ADMIN) return true;
    const keys = await this.getPermissionsForRole(role);
    return keys.includes(permission);
  }

  async assertPermission(role: string, permission: string): Promise<void> {
    if (!(await this.hasPermission(role, permission))) {
      throw new ForbiddenError('Permission refusée');
    }
  }

  async getPermissionsMap(role: string): Promise<Record<string, boolean>> {
    const keys = await this.getPermissionsForRole(role);
    const map: Record<string, boolean> = {};
    for (const k of keys) map[k] = true;
    return map;
  }
}
