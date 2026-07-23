import { inject, injectable } from 'tsyringe';
import { UserRole, type Membership } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

@injectable()
export class MembershipService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Crée ou met à jour la membership primaire (dual-write P3). */
  async ensurePrimary(params: {
    userId: string;
    organizationId: string | null;
    role: UserRole;
    isActive?: boolean;
  }): Promise<Membership> {
    const existing = await this.prisma.membership.findFirst({
      where: {
        userId: params.userId,
        organizationId: params.organizationId,
      },
    });
    if (existing) {
      return this.prisma.membership.update({
        where: { id: existing.id },
        data: {
          role: params.role,
          isActive: params.isActive ?? true,
          isPrimary: true,
        },
      });
    }
    // Désactiver isPrimary sur les autres
    await this.prisma.membership.updateMany({
      where: { userId: params.userId, isPrimary: true },
      data: { isPrimary: false },
    });
    return this.prisma.membership.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        role: params.role,
        isActive: params.isActive ?? true,
        isPrimary: true,
      },
    });
  }

  async getPrimary(userId: string): Promise<Membership | null> {
    return this.prisma.membership.findFirst({
      where: { userId, isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async listForUser(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId, isActive: true },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }
}
