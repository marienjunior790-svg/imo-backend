import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from '../../shared/services/audit.service.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app.error.js';
import { env } from '../../config/env.js';
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  sendInvitationEmail,
} from './invitation.mail.js';
import type { AcceptInvitationInput, CreateInvitationInput } from './invitation.schema.js';

@injectable()
export class InvitationService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AuthService) private readonly authService: AuthService,
    @inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async create(
    actor: { userId: string; role: UserRole; organizationId: string | null },
    input: CreateInvitationInput,
  ) {
    this.assertCanInvite(actor.role);
    const organizationId = actor.organizationId;
    if (!organizationId) throw new ForbiddenError('Organisation requise');

    const email = input.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictError('Cet e-mail est déjà utilisé');

    const pending = await this.prisma.invitation.findFirst({
      where: {
        email,
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) throw new ConflictError('Une invitation active existe déjà pour cet e-mail');

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundError('Organisation introuvable');

    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + env.INVITE_TTL_HOURS * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email,
        role: input.role as UserRole,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        tokenHash,
        invitedById: actor.userId,
        expiresAt,
      },
    });

    const inviteUrl = buildInviteUrl(rawToken);
    sendInvitationEmail({
      to: email,
      firstName: input.firstName,
      organizationName: org.name,
      role: input.role,
      inviteUrl,
      expiresAt,
    });

    await this.auditService.log({
      action: AuditAction.INVITE_CREATE,
      userId: actor.userId,
      userRole: actor.role,
      organizationId,
      resourceType: 'Invitation',
      resourceId: invitation.id,
      newValue: { email, role: input.role },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      expiresAt: invitation.expiresAt,
      inviteUrl: env.NODE_ENV === 'production' ? undefined : inviteUrl,
      message: 'Invitation envoyée',
    };
  }

  async list(actor: { role: UserRole; organizationId: string | null }) {
    this.assertCanInvite(actor.role);
    if (!actor.organizationId) throw new ForbiddenError('Organisation requise');

    return this.prisma.invitation.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  async getByToken(rawToken: string) {
    const invitation = await this.findValidInvitation(rawToken);
    const org = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { id: true, name: true },
    });
    return {
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      role: invitation.role,
      organizationName: org?.name ?? 'Organisation',
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(rawToken: string, input: AcceptInvitationInput) {
    const invitation = await this.findValidInvitation(rawToken);
    const email = invitation.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError('Cet e-mail est déjà utilisé');

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          phone: invitation.phone,
          role: invitation.role,
          organizationId: invitation.organizationId,
          isActive: true,
          proAccessEnabled: false,
        },
      });
      await tx.membership.create({
        data: {
          userId: created.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
          isActive: true,
          isPrimary: true,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    await this.auditService.log({
      action: AuditAction.INVITE_ACCEPT,
      userId: user.id,
      userRole: user.role,
      organizationId: user.organizationId,
      resourceType: 'Invitation',
      resourceId: invitation.id,
      newValue: { email: user.email, role: user.role },
    });

    return this.authService.issueSessionForUser(user.id);
  }

  async revoke(actor: { userId: string; role: UserRole; organizationId: string | null }, invitationId: string) {
    this.assertCanInvite(actor.role);
    if (!actor.organizationId) throw new ForbiddenError('Organisation requise');

    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.organizationId !== actor.organizationId) {
      throw new NotFoundError('Invitation introuvable');
    }
    if (invitation.acceptedAt) throw new ValidationError('Invitation déjà acceptée');
    if (invitation.revokedAt) throw new ValidationError('Invitation déjà révoquée');

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      action: AuditAction.INVITE_REVOKE,
      userId: actor.userId,
      userRole: actor.role,
      organizationId: actor.organizationId,
      resourceType: 'Invitation',
      resourceId: invitationId,
    });

    return { id: invitationId, revoked: true };
  }

  private assertCanInvite(role: UserRole) {
    if (role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Seuls les administrateurs peuvent inviter');
    }
  }

  private async findValidInvitation(rawToken: string) {
    if (!rawToken || rawToken.length < 16) {
      throw new ValidationError('Lien d\'invitation invalide');
    }
    const tokenHash = hashInviteToken(rawToken);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });
    if (!invitation) throw new NotFoundError('Invitation introuvable');
    if (invitation.revokedAt) throw new ValidationError('Invitation révoquée');
    if (invitation.acceptedAt) throw new ValidationError('Invitation déjà utilisée');
    if (invitation.expiresAt < new Date()) throw new ValidationError('Invitation expirée');
    return invitation;
  }
}
