import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcrypt';
import { PortalAccessStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../shared/errors/app.error.js';
import { AuditService } from '../../shared/services/audit.service.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { isOrgAdminLevel } from '../../shared/auth/roles.js';
import { generateLoginId, generateTemporaryPassword } from '../../shared/auth/credential-crypto.js';
import { sanitizeUser } from '../../shared/utils/response.util.js';

export type StaffProvisionRole = 'AGENT' | 'MANAGER' | 'ACCOUNTANT';

export interface StaffProvisionInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  role?: StaffProvisionRole;
}

/**
 * Provisionne un collaborateur (AGENT / MANAGER / ACCOUNTANT) :
 * Identity (User) + Membership + mot de passe temporaire.
 * Pas de table AgentProfile séparée — le profil agent = User(role=AGENT).
 */
@injectable()
export class StaffProvisionService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AuditService) private readonly audit: AuditService,
  ) {}

  async provision(
    actor: { userId: string; role: UserRole; organizationId: string | null },
    input: StaffProvisionInput,
  ) {
    if (!isOrgAdminLevel(actor.role)) {
      throw new ForbiddenError('Seul le propriétaire peut provisionner des collaborateurs');
    }
    const organizationId = actor.organizationId;
    if (!organizationId) throw new ForbiddenError('Organisation requise');

    const role = (input.role ?? 'AGENT') as UserRole;
    if (!['AGENT', 'MANAGER', 'ACCOUNTANT'].includes(role)) {
      throw new ValidationError('Rôle non supporté pour le provisionnement staff');
    }

    const email = input.email?.trim().toLowerCase() || null;
    if (email) {
      const clash = await this.prisma.user.findUnique({ where: { email } });
      if (clash) throw new ConflictError('Cet e-mail est déjà utilisé');
    }

    let loginId: string | null = null;
    if (!email) {
      loginId = await this.allocateLoginId();
    }

    const temporaryPassword = generateTemporaryPassword(20);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          loginId,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone?.trim() || null,
          role,
          organizationId,
          isActive: true,
          mustChangePassword: true,
          tempPasswordSetAt: now,
          portalStatus: PortalAccessStatus.PROVISIONED,
          proAccessEnabled: false,
        },
      });
      if (!created.email && !created.loginId) {
        throw new ValidationError('Échec provisionnement : aucun identifiant de connexion');
      }
      await tx.membership.create({
        data: {
          userId: created.id,
          organizationId,
          role,
          isActive: true,
          isPrimary: true,
        },
      });
      return created;
    });

    await this.audit.log({
      action: AuditAction.USER_CREATE,
      userId: actor.userId,
      userRole: actor.role,
      organizationId,
      resourceType: 'User',
      resourceId: user.id,
      newValue: {
        role: user.role,
        portalStatus: PortalAccessStatus.PROVISIONED,
        mustChangePassword: true,
        provisioned: true,
      },
    });

    return {
      user: sanitizeUser({ ...user, passwordHash: '' }),
      account: {
        provisioned: true,
        portalStatus: PortalAccessStatus.PROVISIONED,
        identifier: user.email ?? user.loginId,
        email: user.email,
        loginId: user.loginId,
        mustChangePassword: true,
        temporaryPassword,
        role: user.role,
        hasLoginAccess: true,
      },
      message: 'Collaborateur provisionné — remettez les identifiants',
    };
  }

  /**
   * Répare un collaborateur historique sans email ni loginId :
   * alloue un loginId + mot de passe temporaire (ne crée jamais d’email inventé).
   * Idempotent si un identifiant existe déjà : régénère uniquement le mot de passe.
   */
  async provisionAccess(
    actor: { userId: string; role: UserRole; organizationId: string | null },
    targetUserId: string,
  ) {
    if (!isOrgAdminLevel(actor.role)) {
      throw new ForbiddenError('Seul le propriétaire peut configurer l’accès collaborateur');
    }
    const organizationId = actor.organizationId;
    if (!organizationId) throw new ForbiddenError('Organisation requise');

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target || target.organizationId !== organizationId) {
      throw new ForbiddenError('Collaborateur introuvable dans votre organisation');
    }
    if (!['AGENT', 'MANAGER', 'ACCOUNTANT', 'TECHNICIAN', 'MAINTENANCE_LEAD'].includes(target.role)) {
      throw new ValidationError('Accès réservé aux collaborateurs métier (pas OWNER/TENANT)');
    }

    let loginId = target.loginId;
    if (!target.email && !loginId) {
      loginId = await this.allocateLoginId();
    }

    const temporaryPassword = generateTemporaryPassword(20);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          loginId,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
          tempPasswordSetAt: now,
          portalStatus: PortalAccessStatus.PROVISIONED,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: updated.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return updated;
    });

    await this.audit.log({
      action: AuditAction.USER_UPDATE,
      userId: actor.userId,
      userRole: actor.role,
      organizationId,
      resourceType: 'User',
      resourceId: user.id,
      newValue: {
        provisionAccess: true,
        loginId: user.loginId,
        mustChangePassword: true,
      },
    });

    return {
      user: sanitizeUser({ ...user, passwordHash: '' }),
      account: {
        provisioned: true,
        portalStatus: PortalAccessStatus.PROVISIONED,
        identifier: user.email ?? user.loginId,
        email: user.email,
        loginId: user.loginId,
        mustChangePassword: true,
        temporaryPassword,
        role: user.role,
        hasLoginAccess: true,
      },
      message: 'Accès configuré — remettez les identifiants une seule fois',
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
}
