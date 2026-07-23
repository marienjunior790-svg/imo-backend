import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { UnauthorizedError, ConflictError, ForbiddenError, ValidationError } from '../../shared/errors/app.error.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { FeatureService } from '../features/feature.service.js';
import { RbacService } from '../../shared/rbac/rbac.service.js';
import { AuditService } from '../../shared/services/audit.service.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/middleware/auth.middleware.js';
import { sanitizeUser } from '../../shared/utils/response.util.js';
import { resolveHomePath } from '../../shared/auth/home-path.js';
import { MembershipService } from '../../shared/auth/membership.service.js';
import { resolveModulesForRole } from '../../shared/auth/modules.js';
import {
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
} from '../../shared/auth/totp.js';
import { env } from '../../config/env.js';
import {
  createInitialOnboarding,
  toOnboardingSnapshot,
} from '../onboarding/onboarding.service.js';
import type { OnboardingInput, LoginInput } from './auth.schema.js';
import type { Prisma } from '@prisma/client';

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
          onboarding: createInitialOnboarding({
            firstPropertyDone: Boolean(data.onboarding),
          }) as unknown as Prisma.InputJsonValue,
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

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: UserRole.ORG_ADMIN,
          isActive: true,
          isPrimary: true,
        },
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

  saveRefreshToken(
    userId: string,
    organizationId: string | null,
    token: string,
    expiresAt: Date,
    opts?: { familyId?: string; userAgent?: string; ipAddress?: string },
  ) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const familyId = opts?.familyId ?? randomBytes(16).toString('hex');
    return this.prisma.refreshToken.create({
      data: {
        userId,
        organizationId,
        tokenHash,
        expiresAt,
        familyId,
        userAgent: opts?.userAgent,
        ipAddress: opts?.ipAddress,
        lastUsedAt: new Date(),
      },
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

  async markRefreshReplaced(oldTokenHash: string, newTokenId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { tokenHash: oldTokenHash, revokedAt: null },
      data: { revokedAt: new Date(), replacedByTokenId: newTokenId },
    });
  }

  revokeRefreshToken(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeRefreshFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllUserRefreshTokens(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  listSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        familyId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
  }

  findSessionById(userId: string, sessionId: string) {
    return this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });
  }

  revokeSessionById(userId: string, sessionId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  createTenantUser(data: { email: string; passwordHash: string; firstName: string; lastName: string; phone: string }) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
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
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: null,
          role: UserRole.TENANT,
          isActive: true,
          isPrimary: true,
        },
      });
      return user;
    });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  recordFailedLogin(userId: string) {
    const threshold = env.AUTH_LOCKOUT_THRESHOLD;
    const minutes = env.AUTH_LOCKOUT_MINUTES;
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      if (user.failedLoginAttempts >= threshold) {
        return tx.user.update({
          where: { id: userId },
          data: {
            lockedUntil: new Date(Date.now() + minutes * 60_000),
          },
        });
      }
      return user;
    });
  }

  clearLoginFailures(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findPasswordResetToken(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  markPasswordResetUsed(id: string) {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  setMfaPendingSecret(userId: string, secret: string, recoveryHashes: string[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabled: false, mfaRecoveryHashes: recoveryHashes },
    });
  }

  enableMfa(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
  }

  disableMfa(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryHashes: [] },
    });
  }

  consumeRecoveryCode(userId: string, remainingHashes: string[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { mfaRecoveryHashes: remainingHashes },
    });
  }

  listSecurityEvents(userId: string, limit: number) {
    return this.prisma.auditLog.findMany({
      where: {
        userId,
        action: {
          in: [
            'AUTH_LOGIN',
            'AUTH_LOGIN_FAILED',
            'AUTH_LOGOUT',
            'AUTH_PASSWORD_CHANGE',
            'AUTH_PASSWORD_RESET',
            'AUTH_PASSWORD_RESET_REQUEST',
            'AUTH_TOKEN_REFRESH',
            'AUTH_TOKEN_REUSE',
            'AUTH_SESSION_REVOKE',
            'AUTH_MFA_SETUP',
            'AUTH_MFA_ENABLE',
            'AUTH_MFA_DISABLE',
            'AUTH_ACCOUNT_LOCKED',
            'INVITE_ACCEPT',
            'MEMBERSHIP_CREATE',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        action: true,
        success: true,
        ipAddress: true,
        createdAt: true,
        errorMessage: true,
      },
    });
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
    @inject(MembershipService) private readonly membershipService: MembershipService,
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

    const extras = await this.buildSessionExtras(user);
    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.role,
      user.organizationId,
      extras.membership.id,
    );
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

    const onboarding = toOnboardingSnapshot(user.organization?.onboarding);

    return {
      user: sanitizeUser(user),
      organization: user.organization,
      subscription,
      permissions,
      rbac,
      homePath: resolveHomePath(user.role),
      onboarding,
      ...extras,
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

    const extras = await this.buildSessionExtras(user);
    const tokens = await this.issueTokens(user.id, user.email, user.role, null, extras.membership.id);
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
      homePath: resolveHomePath(user.role),
      ...extras,
      ...tokens,
    };
  }

  async login(input: LoginInput, meta?: { ipAddress?: string; userAgent?: string }) {
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

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.auditService.log({
        action: AuditAction.AUTH_ACCOUNT_LOCKED,
        userId: user.id,
        userRole: user.role,
        organizationId: user.organizationId,
        ipAddress: meta?.ipAddress,
        success: false,
      });
      throw new ForbiddenError(
        `Compte temporairement verrouillé. Réessayez après ${user.lockedUntil.toISOString()}`,
        'ACCOUNT_LOCKED',
      );
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      const updated = await this.repo.recordFailedLogin(user.id);
      await this.auditService.log({
        action: AuditAction.AUTH_LOGIN_FAILED,
        userId: user.id,
        userRole: user.role,
        organizationId: user.organizationId,
        ipAddress: meta?.ipAddress,
        success: false,
      });
      if (updated.lockedUntil && updated.lockedUntil > new Date()) {
        await this.auditService.log({
          action: AuditAction.AUTH_ACCOUNT_LOCKED,
          userId: user.id,
          userRole: user.role,
          organizationId: user.organizationId,
          ipAddress: meta?.ipAddress,
          success: false,
        });
      }
      throw new UnauthorizedError('Email ou mot de passe incorrect');
    }

    if (user.mfaEnabled) {
      if (!input.mfaCode) {
        return {
          mfaRequired: true as const,
          message: 'Code MFA requis',
        };
      }
      const okTotp = user.mfaSecret ? verifyTotpCode(user.mfaSecret, input.mfaCode) : false;
      let okRecovery = false;
      if (!okTotp && user.mfaRecoveryHashes?.length) {
        const hash = createHash('sha256').update(input.mfaCode).digest('hex');
        const idx = user.mfaRecoveryHashes.indexOf(hash);
        if (idx >= 0) {
          okRecovery = true;
          const remaining = [...user.mfaRecoveryHashes];
          remaining.splice(idx, 1);
          await this.repo.consumeRecoveryCode(user.id, remaining);
        }
      }
      if (!okTotp && !okRecovery) {
        await this.repo.recordFailedLogin(user.id);
        await this.auditService.log({
          action: AuditAction.AUTH_LOGIN_FAILED,
          userId: user.id,
          userRole: user.role,
          organizationId: user.organizationId,
          ipAddress: meta?.ipAddress,
          success: false,
          errorMessage: 'MFA invalide',
        });
        throw new UnauthorizedError('Code MFA invalide');
      }
    }

    await this.repo.clearLoginFailures(user.id);
    const extras = await this.buildSessionExtras(user);
    const effectiveRole = extras.membership.role as UserRole;
    const tokens = await this.issueTokens(
      user.id,
      user.email,
      effectiveRole,
      extras.membership.organizationId ?? user.organizationId,
      extras.membership.id,
      { ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    );

    const subscription = user.organizationId
      ? await this.subscriptionService.getSubscription(user.organizationId)
      : null;
    const permissions = await this.featureService.getUserFeatureMap(user.id, effectiveRole);
    const rbac = await this.rbacService.getPermissionsMap(effectiveRole);

    await this.auditService.log({
      action: AuditAction.AUTH_LOGIN,
      userId: user.id,
      userRole: effectiveRole,
      organizationId: user.organizationId,
      ipAddress: meta?.ipAddress,
    });

    return {
      user: sanitizeUser(user),
      organization: user.organization,
      subscription,
      permissions,
      rbac,
      homePath: resolveHomePath(effectiveRole),
      onboarding: toOnboardingSnapshot(user.organization?.onboarding),
      mfaRequired: false as const,
      ...extras,
      ...tokens,
    };
  }

  async refresh(refreshToken: string, meta?: { ipAddress?: string; userAgent?: string }) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Refresh token invalide');
    }

    const stored = await this.repo.findRefreshToken(refreshToken);
    if (!stored) {
      throw new UnauthorizedError('Refresh token expiré ou révoqué');
    }

    // Reuse detection : token déjà révoqué / remplacé → révoquer la famille
    if (stored.revokedAt || stored.replacedByTokenId) {
      await this.repo.revokeRefreshFamily(stored.familyId);
      await this.auditService.log({
        action: AuditAction.AUTH_TOKEN_REUSE,
        userId: stored.userId,
        userRole: stored.user.role,
        organizationId: stored.user.organizationId,
        ipAddress: meta?.ipAddress,
        success: false,
        errorMessage: 'Refresh token reuse detected',
      });
      throw new UnauthorizedError('Refresh token réutilisé — sessions révoquées');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expiré ou révoqué');
    }

    if (!stored.user.isActive) throw new UnauthorizedError('Compte désactivé');

    const membership = await this.membershipService.ensurePrimary({
      userId: stored.user.id,
      organizationId: stored.user.organizationId,
      role: stored.user.role,
    });
    const tokens = await this.issueTokens(
      stored.user.id,
      stored.user.email,
      membership.role,
      membership.organizationId ?? stored.user.organizationId,
      membership.id,
      { familyId: stored.familyId, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    );

    const oldHash = createHash('sha256').update(refreshToken).digest('hex');
    const newStored = await this.repo.findRefreshToken(tokens.refreshToken);
    if (newStored) {
      await this.repo.markRefreshReplaced(oldHash, newStored.id);
    } else {
      await this.repo.revokeRefreshToken(refreshToken);
    }

    await this.auditService.log({
      action: AuditAction.AUTH_TOKEN_REFRESH,
      userId: stored.user.id,
      userRole: stored.user.role,
      organizationId: stored.user.organizationId,
      ipAddress: meta?.ipAddress,
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

    const extras = await this.buildSessionExtras({
      id: found.id,
      role: found.role,
      organizationId: found.organizationId,
      organization: found.organization,
    });
    const effectiveRole = extras.membership.role as UserRole;

    const subscription = found.organizationId
      ? await this.subscriptionService.getSubscription(found.organizationId)
      : null;
    const permissions = await this.featureService.getUserFeatureMap(found.id, effectiveRole);
    const rbac = await this.rbacService.getPermissionsMap(effectiveRole);

    return {
      user: sanitizeUser(found),
      organization: found.organization,
      subscription,
      permissions,
      rbac,
      homePath: resolveHomePath(effectiveRole),
      onboarding: toOnboardingSnapshot(found.organization?.onboarding),
      ...extras,
    };
  }

  /** Session complète après acceptation d'invitation (P2). */
  async issueSessionForUser(userId: string) {
    const found = await this.repo.findById(userId);
    if (!found || !found.isActive) throw new UnauthorizedError('Utilisateur introuvable');
    const me = await this.me(userId);
    const effectiveRole = (me.membership?.role as UserRole) ?? found.role;
    const tokens = await this.issueTokens(
      found.id,
      found.email,
      effectiveRole,
      me.membership?.organizationId ?? found.organizationId,
      me.membership?.id,
    );
    return { ...me, ...tokens };
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

  private async buildSessionExtras(user: {
    id: string;
    role: UserRole;
    organizationId: string | null;
    organization?: { plan?: string | null } | null;
  }) {
    const membership = await this.membershipService.ensurePrimary({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    const capabilities = await this.rbacService.getPermissionsForRole(user.role);
    const plan =
      user.organization && 'plan' in (user.organization ?? {})
        ? (user.organization as { plan?: string }).plan
        : undefined;
    let resolvedPlan = plan;
    if (!resolvedPlan && user.organizationId) {
      const sub = await this.subscriptionService.getSubscription(user.organizationId).catch(() => null);
      resolvedPlan = sub?.plan;
    }
    const modules = resolveModulesForRole(user.role, resolvedPlan);
    return {
      membership: {
        id: membership.id,
        role: membership.role,
        organizationId: membership.organizationId,
        isPrimary: membership.isPrimary,
        productRole: membership.role === UserRole.ORG_ADMIN ? 'ORG_OWNER' : membership.role,
      },
      capabilities,
      modules,
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: UserRole,
    organizationId: string | null,
    membershipId?: string,
    opts?: { familyId?: string; userAgent?: string; ipAddress?: string },
  ) {
    const payload = {
      sub: userId,
      email,
      role,
      organizationId,
      ...(membershipId ? { mid: membershipId } : {}),
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.repo.saveRefreshToken(userId, organizationId, refreshToken, expiresAt, {
      familyId: opts?.familyId,
      userAgent: opts?.userAgent,
      ipAddress: opts?.ipAddress,
    });

    return { accessToken, refreshToken };
  }

  // ─── P4 Identity & Security ─────────────────────────────────────────────

  async forgotPassword(email: string, meta?: { ipAddress?: string }) {
    const user = await this.repo.findByEmail(email);
    // Toujours succès (pas d'énumération de comptes)
    if (user?.isActive) {
      const raw = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_HOURS * 3600_000);
      await this.repo.createPasswordResetToken(user.id, tokenHash, expiresAt);
      const base = env.PUBLIC_APP_URL ?? 'https://app.itc.cg';
      const resetUrl = `${base.replace(/\/$/, '')}/reset-password?token=${raw}`;
      console.log('[auth] Password reset link (stub mail):', resetUrl);
      await this.auditService.log({
        action: AuditAction.AUTH_PASSWORD_RESET_REQUEST,
        userId: user.id,
        userRole: user.role,
        organizationId: user.organizationId,
        ipAddress: meta?.ipAddress,
      });
    }
    return { sent: true };
  }

  async resetPassword(token: string, newPassword: string, meta?: { ipAddress?: string }) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await this.repo.findPasswordResetToken(tokenHash);
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedError('Lien de réinitialisation invalide ou expiré');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.repo.updatePassword(row.userId, passwordHash);
    await this.repo.markPasswordResetUsed(row.id);
    await this.repo.revokeAllUserRefreshTokens(row.userId);
    await this.auditService.log({
      action: AuditAction.AUTH_PASSWORD_RESET,
      userId: row.userId,
      userRole: row.user.role,
      organizationId: row.user.organizationId,
      ipAddress: meta?.ipAddress,
    });
    return { reset: true };
  }

  async listSessions(userId: string, currentRefreshToken?: string) {
    const sessions = await this.repo.listSessions(userId);
    let currentId: string | undefined;
    if (currentRefreshToken) {
      const cur = await this.repo.findRefreshToken(currentRefreshToken);
      currentId = cur?.id;
    }
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      current: currentId === s.id,
    }));
  }

  async revokeSession(userId: string, sessionId: string, meta?: { ipAddress?: string; role?: UserRole; organizationId?: string | null }) {
    const session = await this.repo.findSessionById(userId, sessionId);
    if (!session) throw new ValidationError('Session introuvable');
    await this.repo.revokeSessionById(userId, sessionId);
    await this.auditService.log({
      action: AuditAction.AUTH_SESSION_REVOKE,
      userId,
      userRole: meta?.role,
      organizationId: meta?.organizationId,
      ipAddress: meta?.ipAddress,
      newValue: { sessionId },
    });
    return { revoked: true };
  }

  async revokeAllSessions(userId: string, meta?: { ipAddress?: string; role?: UserRole; organizationId?: string | null }) {
    await this.repo.revokeAllUserRefreshTokens(userId);
    await this.auditService.log({
      action: AuditAction.AUTH_SESSION_REVOKE,
      userId,
      userRole: meta?.role,
      organizationId: meta?.organizationId,
      ipAddress: meta?.ipAddress,
      newValue: { all: true },
    });
    return { revoked: true };
  }

  async mfaSetup(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) throw new UnauthorizedError('Utilisateur introuvable');
    if (user.mfaEnabled) throw new ConflictError('MFA déjà activé');
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes(8);
    const hashes = recoveryCodes.map((c) => createHash('sha256').update(c).digest('hex'));
    await this.repo.setMfaPendingSecret(userId, secret, hashes);
    await this.auditService.log({
      action: AuditAction.AUTH_MFA_SETUP,
      userId: user.id,
      userRole: user.role,
      organizationId: user.organizationId,
    });
    return {
      secret,
      otpauthUrl: buildOtpAuthUri({ secret, email: user.email }),
      recoveryCodes,
      note: 'Confirmez avec POST /auth/mfa/verify (code TOTP). Conservez les codes de récupération.',
    };
  }

  /** Confirme l’activation MFA après setup. */
  async mfaVerifyEnable(userId: string, code: string) {
    const user = await this.repo.findById(userId);
    if (!user?.mfaSecret) throw new ValidationError('Lancez d’abord POST /auth/mfa/setup');
    if (user.mfaEnabled) throw new ConflictError('MFA déjà activé');
    if (!verifyTotpCode(user.mfaSecret, code)) {
      throw new UnauthorizedError('Code MFA invalide');
    }
    await this.repo.enableMfa(userId);
    await this.auditService.log({
      action: AuditAction.AUTH_MFA_ENABLE,
      userId: user.id,
      userRole: user.role,
      organizationId: user.organizationId,
    });
    return { enabled: true };
  }

  async mfaDisable(userId: string, password: string, code: string, meta?: { ipAddress?: string }) {
    const user = await this.repo.findById(userId);
    if (!user) throw new UnauthorizedError('Utilisateur introuvable');
    if (!user.mfaEnabled || !user.mfaSecret) throw new ValidationError('MFA non activé');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Mot de passe incorrect');
    if (!verifyTotpCode(user.mfaSecret, code)) throw new UnauthorizedError('Code MFA invalide');
    await this.repo.disableMfa(userId);
    await this.auditService.log({
      action: AuditAction.AUTH_MFA_DISABLE,
      userId: user.id,
      userRole: user.role,
      organizationId: user.organizationId,
      ipAddress: meta?.ipAddress,
    });
    return { disabled: true };
  }

  async listSecurityEvents(userId: string, limit = 50) {
    return this.repo.listSecurityEvents(userId, limit);
  }
}
