import { NextFunction, Request, Response } from 'express';
import { container } from 'tsyringe';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { UnauthorizedError } from '../errors/app.error.js';
import { MembershipService } from '../auth/membership.service.js';

/** Revalide le compte en base (actif, rôle, organisation, membership) — évite les JWT obsolètes. */
export async function validateSessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next();
    const prisma = container.resolve(PrismaService);
    const membershipService = container.resolve(MembershipService);
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isActive: true, role: true, organizationId: true, email: true },
    });
    if (!user?.isActive) {
      throw new UnauthorizedError('Compte désactivé ou introuvable');
    }

    let membershipId = req.user.membershipId;
    let role = user.role as UserRole;
    let organizationId = user.organizationId;

    if (membershipId) {
      const mem = await prisma.membership.findFirst({
        where: { id: membershipId, userId: req.user.userId, isActive: true },
      });
      if (mem) {
        role = mem.role;
        organizationId = mem.organizationId;
      } else {
        membershipId = undefined;
      }
    }

    if (!membershipId) {
      const primary = await membershipService.getPrimary(req.user.userId);
      if (primary) {
        membershipId = primary.id;
        role = primary.role;
        organizationId = primary.organizationId;
      } else {
        // Lazy backfill pour comptes legacy
        const created = await membershipService.ensurePrimary({
          userId: req.user.userId,
          organizationId: user.organizationId,
          role: user.role,
          isActive: true,
        });
        membershipId = created.id;
      }
    }

    req.user = {
      userId: req.user.userId,
      email: user.email,
      role,
      organizationId,
      membershipId,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip ?? '';
  return req.ip ?? req.socket.remoteAddress ?? '';
}
