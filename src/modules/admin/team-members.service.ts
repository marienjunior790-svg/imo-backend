import { inject, injectable } from 'tsyringe';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError } from '../../shared/errors/app.error.js';
import { normalizeRole, roleLabel } from '../../shared/auth/roles.js';
import { sanitizeUser } from '../../shared/utils/response.util.js';

export type TeamMemberStatusFilter = 'active' | 'inactive' | 'all';

export interface TeamMemberListFilters {
  /** Rôle Prisma (ex. AGENT, MANAGER). Jamais un organizationId. */
  role?: string;
  status?: TeamMemberStatusFilter;
  search?: string;
}

const memberSelect = {
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

/**
 * Source de vérité partagée : liste des utilisateurs d’une organisation.
 * Utilisée par GET /admin/users et le tool IA getTeamMembers.
 * organizationId vient exclusivement du contexte auth — jamais des args LLM.
 */
@injectable()
export class TeamMembersService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async listOrganizationMembers(organizationId: string, filters: TeamMemberListFilters = {}) {
    const orgId = organizationId?.trim();
    if (!orgId) {
      throw new ForbiddenError('Organisation requise');
    }

    const where: Prisma.UserWhereInput = {
      organizationId: orgId,
    };

    if (filters.role?.trim()) {
      const role = normalizeRole(filters.role.trim());
      // TECHNICIAN est un alias legacy d’AGENT (terrain).
      if (role === UserRole.AGENT) {
        where.role = { in: [UserRole.AGENT, UserRole.TECHNICIAN] };
      } else {
        where.role = role;
      }
    }

    if (filters.status === 'active') where.isActive = true;
    if (filters.status === 'inactive') where.isActive = false;

    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: memberSelect,
    });

    const openStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] as const;
    const ticketCounts =
      users.length === 0
        ? []
        : await this.prisma.maintenanceTicket.groupBy({
            by: ['assignedToId'],
            where: {
              organizationId: orgId,
              assignedToId: { in: users.map((u) => u.id) },
              status: { in: [...openStatuses] },
            },
            _count: { _all: true },
          });
    const openByAssignee = new Map(
      ticketCounts
        .filter((c) => c.assignedToId)
        .map((c) => [c.assignedToId as string, c._count._all]),
    );

    return users.map((u) => {
      const sanitized = sanitizeUser({ ...u, passwordHash: '' });
      return {
        ...sanitized,
        fullName: `${u.firstName} ${u.lastName}`.trim(),
        roleLabel: roleLabel(u.role),
        openAssignedTickets: openByAssignee.get(u.id) ?? 0,
      };
    });
  }
}
