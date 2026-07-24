/**
 * D4 — Si mustChangePassword=true :
 * ALLOW  : change-password, logout, me (+ capabilities/modules lecture)
 * DENY   : tout pipeline métier (orgStaff, tenant/portal, technician, …)
 *
 * Appliqué via security.stack pipelines — pas uniquement Flutter.
 */
import { NextFunction, Request, Response } from 'express';
import { container } from 'tsyringe';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError, UnauthorizedError } from '../errors/app.error.js';

export async function requirePasswordChangedMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const prisma = container.resolve(PrismaService);
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { mustChangePassword: true },
    });
    if (user?.mustChangePassword) {
      throw new ForbiddenError(
        'Changement de mot de passe obligatoire avant de continuer',
        'MUST_CHANGE_PASSWORD',
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
