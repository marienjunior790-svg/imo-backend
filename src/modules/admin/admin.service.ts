import { inject, injectable } from 'tsyringe';

import bcrypt from 'bcrypt';

import { UserRole } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/app.error.js';

import { sanitizeUser } from '../../shared/utils/response.util.js';

import type { z } from 'zod';

import { createOrgUserSchema, updateOrgUserSchema } from './admin.schema.js';



type CreateOrgUserInput = z.infer<typeof createOrgUserSchema>;

type UpdateOrgUserInput = z.infer<typeof updateOrgUserSchema>;



const userSelect = {

  id: true,

  email: true,

  firstName: true,

  lastName: true,

  phone: true,

  role: true,

  isActive: true,

  proAccessEnabled: true,

  organizationId: true,

  lastLoginAt: true,

  createdAt: true,

  organization: { select: { id: true, name: true } },

} as const;



@injectable()

export class AdminService {

  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}



  private assertAdmin(actorRole: UserRole) {

    if (actorRole !== UserRole.SUPER_ADMIN && actorRole !== UserRole.ORG_ADMIN) {

      throw new ForbiddenError('Accès réservé aux administrateurs');

    }

  }



  private async assertTargetInOrg(

    actorRole: UserRole,

    actorOrgId: string | null,

    targetUserId: string,

  ) {

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });

    if (!target) throw new NotFoundError('Utilisateur introuvable');



    if (actorRole === UserRole.SUPER_ADMIN) return target;



    if (target.role === UserRole.SUPER_ADMIN) {

      throw new ForbiddenError('Impossible de modifier un super administrateur');

    }



    if (!actorOrgId || target.organizationId !== actorOrgId) {

      throw new ForbiddenError('Utilisateur hors de votre organisation');

    }



    return target;

  }



  async listUsers(actorRole: UserRole, actorOrgId: string | null) {

    this.assertAdmin(actorRole);



    const where =

      actorRole === UserRole.SUPER_ADMIN

        ? {}

        : { organizationId: actorOrgId ?? undefined };



    const users = await this.prisma.user.findMany({

      where,

      orderBy: [{ organizationId: 'asc' }, { lastName: 'asc' }],

      select: userSelect,

    });



    return users.map((u) => sanitizeUser({ ...u, passwordHash: '' }));

  }



  async createUser(

    actorRole: UserRole,

    actorOrgId: string | null,

    input: CreateOrgUserInput,

  ) {

    this.assertAdmin(actorRole);

    console.warn(
      '[deprecated] POST /admin/users with password — prefer POST /invitations (P2)',
    );



    if (actorRole === UserRole.ORG_ADMIN && !actorOrgId) {

      throw new ForbiddenError('Organisation requise');

    }



    const existing = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });

    if (existing) throw new ConflictError('Cet e-mail est déjà utilisé');



    const organizationId = actorRole === UserRole.SUPER_ADMIN ? actorOrgId : actorOrgId!;

    if (!organizationId) {

      throw new ForbiddenError('Organisation requise pour créer un utilisateur');

    }



    const passwordHash = await bcrypt.hash(input.password, 12);



    const user = await this.prisma.user.create({

      data: {

        email: input.email.toLowerCase(),

        passwordHash,

        firstName: input.firstName,

        lastName: input.lastName,

        phone: input.phone,

        role: input.role as UserRole,

        organizationId,

        proAccessEnabled: false,

      },

      select: userSelect,

    });

    await this.prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        role: input.role as UserRole,
        isActive: true,
        isPrimary: true,
      },
    });

    return sanitizeUser({ ...user, passwordHash: '' });

  }

  async getUserForAudit(actorRole: UserRole, actorOrgId: string | null, targetUserId: string) {
    const target = await this.assertTargetInOrg(actorRole, actorOrgId, targetUserId);
    return { id: target.id, role: target.role, isActive: target.isActive, email: target.email };
  }

  async updateUser(

    actorRole: UserRole,

    actorOrgId: string | null,

    targetUserId: string,

    input: UpdateOrgUserInput,

  ) {

    this.assertAdmin(actorRole);

    const target = await this.assertTargetInOrg(actorRole, actorOrgId, targetUserId);



    if (target.role === UserRole.ORG_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {

      throw new ForbiddenError('Impossible de modifier un autre administrateur');

    }



    if (input.proAccessEnabled !== undefined && target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Impossible de modifier le super-administrateur');
    }



    const user = await this.prisma.user.update({

      where: { id: targetUserId },

      data: {

        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),

        ...(input.role !== undefined ? { role: input.role as UserRole } : {}),

        ...(input.proAccessEnabled !== undefined ? { proAccessEnabled: input.proAccessEnabled } : {}),

      },

      select: userSelect,

    });



    return sanitizeUser({ ...user, passwordHash: '' });

  }

  async deleteUser(actorRole: UserRole, actorOrgId: string | null, actorUserId: string, targetUserId: string) {
    this.assertAdmin(actorRole);
    if (actorUserId === targetUserId) throw new ForbiddenError('Impossible de supprimer votre propre compte');

    const target = await this.assertTargetInOrg(actorRole, actorOrgId, targetUserId);
    if (target.role === UserRole.ORG_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Impossible de supprimer un administrateur organisation');
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isActive: false,
        email: `deleted_${targetUserId}_${Date.now()}@void.local`,
      },
    });

    return { id: targetUserId, email: target.email };
  }
}

