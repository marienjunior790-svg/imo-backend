import { inject, injectable } from 'tsyringe';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ALL_FEATURE_KEYS, FEATURE_CATALOG, FeatureKeyType } from '../../shared/constants/feature-keys.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app.error.js';
import { isOwner } from '../../shared/auth/roles.js';

interface CacheEntry {
  map: Record<string, boolean>;
  overrideKeys: string[];
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@injectable()
export class FeatureService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  async ensureCatalogSeeded(): Promise<void> {
    for (const item of FEATURE_CATALOG) {
      await this.prisma.feature.upsert({
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

  async isFeatureEnabled(userId: string, role: UserRole, featureKey: FeatureKeyType): Promise<boolean> {
    if (role === UserRole.SUPER_ADMIN) return true;
    const map = await this.getUserFeatureMap(userId, role);
    return map[featureKey] ?? true;
  }

  async getUserFeatureMap(userId: string, role: UserRole): Promise<Record<string, boolean>> {
    const { map } = await this.getUserFeatureMapWithMeta(userId, role);
    return map;
  }

  private async getUserFeatureMapWithMeta(userId: string, role: UserRole) {
    if (role === UserRole.SUPER_ADMIN) {
      return {
        map: Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, true])),
        overrideKeys: new Set<string>(),
      };
    }

    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return { map: cached.map, overrideKeys: new Set(cached.overrideKeys) };
    }

    const [features, overrides] = await Promise.all([
      this.prisma.feature.findMany(),
      this.prisma.userFeaturePermission.findMany({ where: { userId } }),
    ]);

    const overrideMap = new Map(overrides.map((o) => [o.featureKey, o.isEnabled]));
    const overrideKeys = overrides.map((o) => o.featureKey);
    const map: Record<string, boolean> = {};

    for (const feature of features) {
      map[feature.key] = overrideMap.has(feature.key) ? overrideMap.get(feature.key)! : feature.defaultEnabled;
    }

    for (const key of ALL_FEATURE_KEYS) {
      if (!(key in map)) map[key] = true;
    }

    this.cache.set(userId, { map, overrideKeys, expiresAt: Date.now() + CACHE_TTL_MS });
    return { map, overrideKeys: new Set(overrideKeys) };
  }

  async getUserFeaturesDetailed(userId: string, role: UserRole) {
    const { map, overrideKeys } = await this.getUserFeatureMapWithMeta(userId, role);
    const features = await this.prisma.feature.findMany({ orderBy: { category: 'asc' } });

    return features.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      category: f.category,
      defaultEnabled: f.defaultEnabled,
      isEnabled: map[f.key] ?? f.defaultEnabled,
      source: overrideKeys.has(f.key) ? ('override' as const) : ('default' as const),
    }));
  }

  async setFeatureForUser(
    targetUserId: string,
    featureKey: string,
    isEnabled: boolean,
    updatedById: string,
  ) {
    const feature = await this.prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature) throw new NotFoundError(`Fonctionnalité inconnue : ${featureKey}`);

    const user = await this.getUserOrThrow(targetUserId);

    await this.prisma.userFeaturePermission.upsert({
      where: { userId_featureKey: { userId: targetUserId, featureKey } },
      update: { isEnabled, updatedById },
      create: { userId: targetUserId, featureKey, isEnabled, updatedById },
    });

    this.invalidateCache(targetUserId);

    return this.getUserFeaturesDetailed(targetUserId, user.role);
  }

  async assertCanManageUser(actorId: string, actorRole: UserRole, actorOrgId: string | null, targetUserId: string) {
    const target = await this.getUserOrThrow(targetUserId);

    if (actorRole === UserRole.SUPER_ADMIN) return target;

    if (!isOwner(actorRole)) {
      throw new ForbiddenError('Seul le propriétaire peut gérer les permissions');
    }

    if (target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Impossible de modifier un super administrateur');
    }

    if (!actorOrgId || target.organizationId !== actorOrgId) {
      throw new ForbiddenError('Utilisateur hors de votre organisation');
    }

    return target;
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('Utilisateur introuvable');
    return user;
  }
}
