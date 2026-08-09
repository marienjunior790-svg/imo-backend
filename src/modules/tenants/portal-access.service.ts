import { inject, injectable } from 'tsyringe';
import { PortalAccessStatus, UserRole, type Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app.error.js';
import { AuditService } from '../../shared/services/audit.service.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import {
  DEFAULT_PORTAL_ACCESS,
  parsePortalAccessSettings,
  type DeliveryMode,
  type PortalAccessSettings,
} from '../../shared/auth/portal-access-settings.js';
import { isLettingManager, isOrgAdminLevel } from '../../shared/auth/roles.js';
import { generateLoginId, generateTemporaryPassword } from '../../shared/auth/credential-crypto.js';
import bcrypt from 'bcrypt';

export type PortalActor = {
  userId: string;
  role: UserRole;
  organizationId: string | null;
};

@injectable()
export class PortalAccessService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AuditService) private readonly audit: AuditService,
  ) {}

  getOrgSettings(portalAccess: unknown): PortalAccessSettings {
    return parsePortalAccessSettings(portalAccess);
  }

  async getOrgSettingsByOrgId(organizationId: string): Promise<PortalAccessSettings> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundError('Organisation introuvable');
    return parsePortalAccessSettings(org.portalAccess);
  }

  async updateOrgSettings(actor: PortalActor, patch: Partial<PortalAccessSettings>) {
    this.assertOrgAdmin(actor);
    if (!actor.organizationId) throw new ForbiddenError('Organisation requise');
    const org = await this.prisma.organization.findUnique({ where: { id: actor.organizationId } });
    if (!org) throw new NotFoundError('Organisation introuvable');
    const current = parsePortalAccessSettings(org.portalAccess);
    const next: PortalAccessSettings = {
      autoProvisionOnLeaseActive:
        patch.autoProvisionOnLeaseActive ?? current.autoProvisionOnLeaseActive,
      deliveryModes: patch.deliveryModes ?? current.deliveryModes,
    };
    if (!next.deliveryModes.includes('IN_APP') && next.deliveryModes.length === 0) {
      next.deliveryModes = [...DEFAULT_PORTAL_ACCESS.deliveryModes];
    }
    await this.prisma.organization.update({
      where: { id: actor.organizationId },
      data: { portalAccess: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  async getStatus(actor: PortalActor, tenantId: string) {
    this.assertCanView(actor);
    const { tenant, user } = await this.loadTenantUser(actor, tenantId);
    if (!user) {
      return {
        tenantId: tenant.id,
        provisioned: false,
        portalStatus: null,
        identifier: null,
        email: tenant.email,
        loginId: null,
        mustChangePassword: false,
        lastLoginAt: null,
        tempPasswordSetAt: null,
        passwordChangedAt: null,
      };
    }
    return {
      tenantId: tenant.id,
      provisioned: true,
      portalStatus: user.portalStatus,
      identifier: user.email ?? user.loginId,
      email: user.email,
      loginId: user.loginId,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      tempPasswordSetAt: user.tempPasswordSetAt,
      passwordChangedAt: user.passwordChangedAt,
      isActive: user.isActive,
    };
  }

  /**
   * Provisionne Identity + Membership TENANT + lien CRM.
   * Retourne temporaryPassword one-shot si Mode A (IN_APP) ou `revealTemporaryPassword`.
   */
  async provision(
    actor: PortalActor,
    tenantId: string,
    opts?: { forceRegenerate?: boolean; revealTemporaryPassword?: boolean },
  ) {
    this.assertCanProvision(actor);
    const organizationId = actor.organizationId!;
    const { tenant, user: existing } = await this.loadTenantUser(actor, tenantId);

    if (existing && !opts?.forceRegenerate) {
      if (existing.portalStatus === PortalAccessStatus.ARCHIVED) {
        throw new ConflictError('Compte archivé — réactivez ou créez un nouvel accès');
      }
      return {
        ...this.statusPayload(tenant.id, existing),
        temporaryPassword: undefined as string | undefined,
        delivery: [] as DeliveryMode[],
        alreadyProvisioned: true,
        message: 'Accès portail déjà provisionné',
      };
    }

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundError('Organisation introuvable');
    const settings = parsePortalAccessSettings(org.portalAccess);
    const tempPassword = generateTemporaryPassword(20);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const email = tenant.email?.trim().toLowerCase() || null;
    if (email) {
      const clash = await this.prisma.user.findFirst({
        where: { email, ...(existing ? { id: { not: existing.id } } : {}) },
      });
      if (clash) throw new ConflictError('Cet e-mail est déjà utilisé par un autre compte');
    }

    let loginId = existing?.loginId ?? null;
    if (!email && !loginId) {
      loginId = await this.allocateLoginId();
    }

    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      let u;
      if (existing) {
        u = await tx.user.update({
          where: { id: existing.id },
          data: {
            email,
            loginId,
            passwordHash,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone,
            role: UserRole.TENANT,
            organizationId,
            isActive: true,
            mustChangePassword: true,
            tempPasswordSetAt: now,
            portalStatus: PortalAccessStatus.PROVISIONED,
          },
        });
        await tx.membership.updateMany({
          where: { userId: u.id, organizationId },
          data: { role: UserRole.TENANT, isActive: true, isPrimary: true },
        });
      } else {
        u = await tx.user.create({
          data: {
            email,
            loginId,
            passwordHash,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone,
            role: UserRole.TENANT,
            organizationId,
            isActive: true,
            mustChangePassword: true,
            tempPasswordSetAt: now,
            portalStatus: PortalAccessStatus.PROVISIONED,
          },
        });
        await tx.membership.create({
          data: {
            userId: u.id,
            organizationId,
            role: UserRole.TENANT,
            isActive: true,
            isPrimary: true,
          },
        });
        await tx.tenant.update({
          where: { id: tenant.id },
          data: { userId: u.id },
        });
      }
      // D3/regen — invalider sessions existantes dès nouveau mdp temporaire
      await tx.refreshToken.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return u;
    });

    const delivery = await this.deliverCredentials(settings.deliveryModes, {
      email: user.email,
      identifier: user.email ?? user.loginId!,
      temporaryPassword: tempPassword,
      firstName: user.firstName,
      organizationName: org.name,
    });

    let portalStatus: PortalAccessStatus = PortalAccessStatus.PROVISIONED;
    if (delivery.includes('EMAIL') || delivery.includes('SMS')) {
      portalStatus = PortalAccessStatus.INVITE_SENT;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { portalStatus },
      });
    }

    await this.audit.log({
      action: opts?.forceRegenerate
        ? AuditAction.PORTAL_PASSWORD_REGENERATED
        : AuditAction.PORTAL_PROVISION,
      userId: actor.userId,
      userRole: actor.role,
      organizationId,
      resourceType: 'Tenant',
      resourceId: tenantId,
      newValue: {
        actorId: actor.userId,
        tenantId,
        userId: user.id,
        portalStatus,
        delivery,
        mustChangePassword: true,
        sessionsRevoked: true,
        timestamp: new Date().toISOString(),
      },
    });

    const showPassword =
      opts?.revealTemporaryPassword === true || settings.deliveryModes.includes('IN_APP');
    return {
      ...this.statusPayload(tenant.id, { ...user, portalStatus }),
      temporaryPassword: showPassword ? tempPassword : undefined,
      delivery,
      alreadyProvisioned: false,
      message: opts?.forceRegenerate ? 'Mot de passe temporaire régénéré' : 'Accès portail provisionné',
    };
  }

  async regenerate(actor: PortalActor, tenantId: string) {
    this.assertCanProvision(actor);
    return this.provision(actor, tenantId, { forceRegenerate: true, revealTemporaryPassword: true });
  }

  async reset(actor: PortalActor, tenantId: string) {
    this.assertCanSuspend(actor);
    return this.provision(actor, tenantId, { forceRegenerate: true, revealTemporaryPassword: true });
  }

  async suspend(actor: PortalActor, tenantId: string) {
    this.assertCanSuspend(actor);
    const { tenant, user } = await this.loadTenantUser(actor, tenantId);
    if (!user) throw new NotFoundError('Aucun accès portail pour ce locataire');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { isActive: false, portalStatus: PortalAccessStatus.SUSPENDED },
      });
      await tx.membership.updateMany({
        where: { userId: user.id, organizationId: actor.organizationId! },
        data: { isActive: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.audit.log({
      action: AuditAction.PORTAL_SUSPEND,
      userId: actor.userId,
      userRole: actor.role,
      organizationId: actor.organizationId,
      resourceType: 'Tenant',
      resourceId: tenant.id,
    });
    return { tenantId: tenant.id, portalStatus: PortalAccessStatus.SUSPENDED };
  }

  async reactivate(actor: PortalActor, tenantId: string) {
    this.assertCanSuspend(actor);
    const { tenant, user } = await this.loadTenantUser(actor, tenantId);
    if (!user) throw new NotFoundError('Aucun accès portail pour ce locataire');
    if (user.portalStatus === PortalAccessStatus.ARCHIVED) {
      throw new ValidationError('Compte archivé — provisionnez à nouveau');
    }
    const status = user.mustChangePassword
      ? user.tempPasswordSetAt && !user.lastLoginAt
        ? PortalAccessStatus.PROVISIONED
        : PortalAccessStatus.INVITE_SENT
      : PortalAccessStatus.ACTIVATED;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { isActive: true, portalStatus: status },
      });
      await tx.membership.updateMany({
        where: { userId: user.id, organizationId: actor.organizationId! },
        data: { isActive: true },
      });
    });
    await this.audit.log({
      action: AuditAction.PORTAL_REACTIVATE,
      userId: actor.userId,
      userRole: actor.role,
      organizationId: actor.organizationId,
      resourceType: 'Tenant',
      resourceId: tenant.id,
    });
    return { tenantId: tenant.id, portalStatus: status };
  }

  async archive(actor: PortalActor, tenantId: string) {
    this.assertCanSuspend(actor);
    const { tenant, user } = await this.loadTenantUser(actor, tenantId);
    if (!user) throw new NotFoundError('Aucun accès portail pour ce locataire');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { isActive: false, portalStatus: PortalAccessStatus.ARCHIVED },
      });
      await tx.membership.updateMany({
        where: { userId: user.id, organizationId: actor.organizationId! },
        data: { isActive: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.audit.log({
      action: AuditAction.PORTAL_ARCHIVE,
      userId: actor.userId,
      userRole: actor.role,
      organizationId: actor.organizationId,
      resourceType: 'Tenant',
      resourceId: tenant.id,
    });
    return { tenantId: tenant.id, portalStatus: PortalAccessStatus.ARCHIVED };
  }

  /**
   * Hook bail ACTIVE — crée le compte TENANT s'il n'existe pas.
   * Produit : toujours provisionner à l'activation (setting `autoProvisionOnLeaseActive`
   * conservé pour désactivation explicite par org).
   * Identifiants one-shot toujours révélés au propriétaire (IN_APP) pour copie / téléchargement.
   */
  async maybeAutoProvisionOnLeaseActive(organizationId: string, tenantId: string, actorUserId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return null;
    const settings = parsePortalAccessSettings(org.portalAccess);
    if (!settings.autoProvisionOnLeaseActive) {
      return {
        skipped: true,
        reason: 'AUTO_PROVISION_DISABLED',
        message: 'Provision automatique désactivée pour cette organisation',
      };
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, organizationId },
      include: { user: true },
    });
    if (!tenant) return null;

    const actorUser = await this.prisma.user.findUnique({ where: { id: actorUserId } });
    const actorRole = (actorUser?.role ?? UserRole.OWNER) as UserRole;

    if (tenant.userId && tenant.user && tenant.user.portalStatus !== PortalAccessStatus.ARCHIVED) {
      return {
        ...this.statusPayload(tenant.id, tenant.user),
        temporaryPassword: undefined as string | undefined,
        alreadyProvisioned: true,
        message: 'Compte locataire déjà existant — aucun nouveau mot de passe généré',
      };
    }

    return this.provision(
      { userId: actorUserId, role: actorRole, organizationId },
      tenantId,
      { revealTemporaryPassword: true },
    );
  }

  markActivated(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        portalStatus: PortalAccessStatus.ACTIVATED,
      },
    });
  }

  private statusPayload(
    tenantId: string,
    user: {
      email: string | null;
      loginId: string | null;
      mustChangePassword: boolean;
      lastLoginAt: Date | null;
      tempPasswordSetAt: Date | null;
      passwordChangedAt: Date | null;
      portalStatus: PortalAccessStatus | null;
      isActive?: boolean;
    },
  ) {
    return {
      tenantId,
      provisioned: true,
      portalStatus: user.portalStatus,
      identifier: user.email ?? user.loginId,
      email: user.email,
      loginId: user.loginId,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      tempPasswordSetAt: user.tempPasswordSetAt,
      passwordChangedAt: user.passwordChangedAt,
      isActive: user.isActive ?? true,
    };
  }

  private async allocateLoginId(): Promise<string> {
    for (let i = 0; i < 32; i++) {
      const candidate = generateLoginId();
      const exists = await this.prisma.user.findUnique({ where: { loginId: candidate } });
      if (!exists) return candidate;
    }
    throw new ConflictError('Impossible de générer un loginId unique');
  }

  private async deliverCredentials(
    modes: DeliveryMode[],
    payload: {
      email: string | null;
      identifier: string;
      temporaryPassword: string;
      firstName: string;
      organizationName: string;
    },
  ): Promise<DeliveryMode[]> {
    const done: DeliveryMode[] = [];
    if (modes.includes('IN_APP')) done.push('IN_APP');
    if (modes.includes('EMAIL') && payload.email) {
      console.log(
        `[portal] EMAIL stub → ${payload.email} | id=${payload.identifier} | org=${payload.organizationName}`,
      );
      done.push('EMAIL');
    }
    if (modes.includes('SMS')) {
      console.log(`[portal] SMS stub (flag) | id=${payload.identifier}`);
      done.push('SMS');
    }
    return done;
  }

  private async loadTenantUser(actor: PortalActor, tenantId: string) {
    if (!actor.organizationId) throw new ForbiddenError('Organisation requise');
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, organizationId: actor.organizationId },
      include: { user: true },
    });
    if (!tenant) throw new NotFoundError('Locataire introuvable');
    return { tenant, user: tenant.user };
  }

  private assertOrgAdmin(actor: PortalActor) {
    if (!isOrgAdminLevel(actor.role)) {
      throw new ForbiddenError('Réservé au propriétaire de l\'organisation');
    }
  }

  private assertCanView(actor: PortalActor) {
    if (!isLettingManager(actor.role)) {
      throw new ForbiddenError('Permission refusée');
    }
  }

  private assertCanProvision(actor: PortalActor) {
    this.assertCanView(actor);
  }

  private assertCanSuspend(actor: PortalActor) {
    if (!isLettingManager(actor.role)) {
      throw new ForbiddenError('Seuls le propriétaire et le gestionnaire peuvent suspendre / réinitialiser');
    }
  }
}
