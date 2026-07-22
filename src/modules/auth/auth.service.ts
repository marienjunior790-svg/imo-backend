import { createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { UnauthorizedError, ConflictError } from '../../shared/errors/app.error.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { FeatureService } from '../features/feature.service.js';
import { RbacService } from '../../shared/rbac/rbac.service.js';
import { AuditService } from '../../shared/services/audit.service.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/middleware/auth.middleware.js';
import { sanitizeUser } from '../../shared/utils/response.util.js';
import type { OnboardingInput } from './auth.schema.js';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  organizationName: string;
  organizationType: 'AGENCY' | 'OWNER';
  onboarding?: OnboardingInput;
}

export interface LoginInput {
  email: string;
  password: string;
}

@injectable()
export class AuthRepository {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { organization: true },
    });
  }

  createOrganizationWithAdmin(data: RegisterInput & { passwordHash: string }) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.organizationName,
          type: data.organizationType,
          email: data.email.toLowerCase(),
          phone: data.phone,
          // Self-serve : org immédiatement utilisable (sinon USER_CREATE / admin bloqués en 403).
          isValidated: true,
        },
      });

      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: UserRole.ORG_ADMIN,
          organizationId: org.id,
          proAccessEnabled: false,
        },
        include: { organization: true },
      });

      if (data.onboarding) {
        const ob = data.onboarding;
        const building = await tx.building.create({
          data: {
            organizationId: org.id,
            name: ob.buildingName,
            address: ob.buildingAddress,
            district: ob.district,
          },
        });

        const tenantCount = Math.min(ob.tenantCount ?? 0, ob.doorCount);
        const tenants = [];

        for (let i = 0; i < tenantCount; i++) {
          const tenant = await tx.tenant.create({
            data: {
              organizationId: org.id,
              firstName: `Locataire`,
              lastName: `${i + 1}`,
              phone: data.phone ?? '000000000',
              email: null,
              notes: 'Créé lors de l\'inscription — à compléter',
            },
          });
          tenants.push(tenant);
        }

        for (let i = 0; i < ob.doorCount; i++) {
          const isOccupied = i < tenantCount;
          await tx.apartment.create({
            data: {
              organizationId: org.id,
              buildingId: building.id,
              label: `Porte ${i + 1}`,
              floor: Math.floor(i / 4),
              rentAmount: ob.defaultRentAmount,
              status: isOccupied ? ApartmentStatus.OCCUPIED : ApartmentStatus.AVAILABLE,
            },
          });
        }
      }

      return user;
    });
  }

  updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  saveRefreshToken(userId: string, organizationId: string | null, token: string, expiresAt: Date) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.prisma.refreshToken.create({
      data: { userId, organizationId, tokenHash, expiresAt },
    });
  }

  findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
  }

  findRefreshToken(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { organization: true } } },
    });
  }

  revokeRefreshToken(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  createTenantUser(data: { email: string; passwordHash: string; firstName: string; lastName: string; phone: string }) {
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: UserRole.TENANT,
        organizationId: null,
      },
    });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}

@injectable()
export class AuthService {
  constructor(
    @inject(AuthRepository) private readonly repo: AuthRepository,
    @inject(SubscriptionService) private readonly subscriptionService: SubscriptionService,
    @inject(FeatureService) private readonly featureService: FeatureService,
    @inject(RbacService) private readonly rbacService: RbacService,
    @inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.toLowerCase();
    console.log('[auth] Signup started', { email, org: input.organizationName, type: input.organizationType });

    const existing = await this.repo.findByEmail(email);
    if (existing) {
      console.warn('[auth] Signup conflict — email exists', { email });
      throw new ConflictError('Cet email est déjà utilisé');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    console.log('[auth] Password hashed');

    let user;
    try {
      user = await this.repo.createOrganizationWithAdmin({ ...input, email, passwordHash });
      console.log('[auth] Auth user + organization created', {
        userId: user.id,
        role: user.role,
        organizationId: user.organizationId,
      });
    } catch (err) {
      console.error('[auth] Organization/user transaction failed', {
        email,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }

    if (user.organizationId) {
      try {
        await this.subscriptionService.createDefaultSubscription(user.organizationId);
        console.log('[auth] Default subscription created', { organizationId: user.organizationId });
      } catch (err) {
        // Compte déjà commité : ne pas bloquer la session — l'utilisateur doit pouvoir se connecter.
        console.error('[auth] Subscription create failed (non-blocking)', {
          organizationId: user.organizationId,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role, user.organizationId);
    console.log('[auth] Session created', { userId: user.id });

    const subscription = user.organizationId
      ? await this.subscriptionService.getSubscription(user.organizationId).catch(() => null)
      : null;
    const permissions = await this.featureService.getUserFeatureMap(user.id, user.role);
    const rbac = await this.rbacService.getPermissionsMap(user.role);

    await this.auditService.log({
      action: AuditAction.AUTH_REGISTER_ORG,
      userId: user.id,
      userRole: user.role,
      organizationId: user.organizationId,
      newValue: { email: user.email, organizationName: input.organizationName },
    }).catch(() => undefined);

    console.log('[auth] Signup complete — redirect with session', { userId: user.id, role: user.role });

    return {
      user: sanitizeUser(user),
      organization: user.organization,
      subscription,
      permissions,
      rbac,
      ...tokens,
    };
  }

  async registerTenant(input: { email: string; password: string; firstName: string; lastName: string; phone: string }) {
    const email = input.email.toLowerCase();
    console.log('[auth] Tenant signup started', { email });

    const existing = await this.repo.findByEmail(email);
    if (existing) {
      console.warn('[auth] Tenant signup conflict', { email });
      throw new ConflictError('Cet email est déjà utilisé');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    console.log('[auth] Tenant password hashed');

    let user;
    try {
      user = await this.repo.createTenantUser({ ...input, email, passwordHash });
      console.log('[auth] Tenant user created', { userId: user.id, role: user.role });
    } catch (err) {
      console.error('[auth] Tenant user create failed', {
        email,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }

    await this.auditService.log({
      action: AuditAction.AUTH_REGISTER_TENANT,
      userId: user.id,
      userRole: user.role,
      newValue: { email: user.email },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role, null);
    console.log('[auth] Tenant session created', { userId: user.id });

    const permissions = await this.featureService.getUserFeatureMap(user.id, user.role);
    const rbac = await this.rbacService.getPermissionsMap(user.role);

    console.log('[auth] Tenant signup complete', { userId: user.id });

    return {
      user: sanitizeUser(user),
      organization: null,
      subscription: null,
      permissions,
      rbac,
      ...tokens,
    };
  }

  async login(input: LoginInput, meta?: { ipAddress?: string }) {
    const user = await this.repo.findByEmail(input.email);
    if (!user || !user.isActive) {
      await this.auditService.log({
        action: AuditAction.AUTH_LOGIN_FAILED,
        ipAddress: meta?.ipAddress,
        newValue: { email: input.email.toLowerCase() },
        success: false,
      });
      throw new UnauthorizedError('Email ou mot de passe incorrect');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      await this.auditService.log({
        action: AuditAction.AUTH_LOGIN_FAILED,
        userId: user.id,
        userRole: user.role,
        organizationId: user.organizationId,
        ipAddress: meta?.ipAddress,
        success: false,
      });
      throw new UnauthorizedError('Email ou mot de passe incorrect');
    }

    await this.repo.updateLastLogin(user.id);
    const tokens = await this.issueTokens(user.id, user.email, user.role, user.organizationId);

    const subscription = user.organizationId
      ? await this.subscriptionService.getSubscription(user.organizationId)
      : null;
    const permissions = await this.featureService.getUserFeatureMap(user.id, user.role);
    const rbac = await this.rbacService.getPermissionsMap(user.role);

    await this.auditService.log({
      action: AuditAction.AUTH_LOGIN,
      userId: user.id,
      userRole: user.role,
      organizationId: user.organizationId,
      ipAddress: meta?.ipAddress,
    });

    return {
      user: sanitizeUser(user),
      organization: user.organization,
      subscription,
      permissions,
      rbac,
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Refresh token invalide');
    }

    const stored = await this.repo.findRefreshToken(refreshToken);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expiré ou révoqué');
    }

    if (!stored.user.isActive) throw new UnauthorizedError('Compte désactivé');

    await this.repo.revokeRefreshToken(refreshToken);
    const tokens = await this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      stored.user.organizationId,
    );
    await this.auditService.log({
      action: AuditAction.AUTH_TOKEN_REFRESH,
      userId: stored.user.id,
      userRole: stored.user.role,
      organizationId: stored.user.organizationId,
    });
    return tokens;
  }

  async logout(refreshToken: string, meta?: { userId?: string; userRole?: UserRole; organizationId?: string | null; ipAddress?: string }) {
    await this.repo.revokeRefreshToken(refreshToken);
    if (meta?.userId) {
      await this.auditService.log({
        action: AuditAction.AUTH_LOGOUT,
        userId: meta.userId,
        userRole: meta.userRole,
        organizationId: meta.organizationId,
        ipAddress: meta.ipAddress,
      });
    }
  }

  async me(userId: string) {
    const found = await this.repo.findById(userId);
    if (!found) throw new UnauthorizedError('Utilisateur introuvable');

    const subscription = found.organizationId
      ? await this.subscriptionService.getSubscription(found.organizationId)
      : null;
    const permissions = await this.featureService.getUserFeatureMap(found.id, found.role);
    const rbac = await this.rbacService.getPermissionsMap(found.role);

    return { user: sanitizeUser(found), organization: found.organization, subscription, permissions, rbac };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, meta?: { ipAddress?: string }) {
    const user = await this.repo.findById(userId);
    if (!user) throw new UnauthorizedError('Utilisateur introuvable');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      await this.auditService.log({
        action: AuditAction.AUTH_PASSWORD_CHANGE,
        userId: user.id,
        userRole: user.role,
        organizationId: user.organizationId,
        ipAddress: meta?.ipAddress,
        success: false,
        errorMessage: 'Mot de passe actuel incorrect',
      });
      throw new UnauthorizedError('Mot de passe actuel incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.repo.updatePassword(userId, passwordHash);

    await this.auditService.log({
      action: AuditAction.AUTH_PASSWORD_CHANGE,
      userId: user.id,
      userRole: user.role,
      organizationId: user.organizationId,
      ipAddress: meta?.ipAddress,
    });
  }

  private async issueTokens(userId: string, email: string, role: UserRole, organizationId: string | null) {
    const payload = { sub: userId, email, role, organizationId };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.repo.saveRefreshToken(userId, organizationId, refreshToken, expiresAt);

    return { accessToken, refreshToken };
  }
}
