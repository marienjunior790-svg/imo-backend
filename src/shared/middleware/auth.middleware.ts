import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../errors/app.error.js';
import { AuthUser } from '../types/express.js';

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  /** P3 — membership active (optionnel, dual-compat) */
  mid?: string;
}

export function signAccessToken(payload: JwtAccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: JwtAccessPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload;
}

export function verifyRefreshToken(token: string): JwtAccessPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtAccessPayload;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token manquant');
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      membershipId: payload.mid,
    };
    next();
  } catch (err) {
    next(err instanceof UnauthorizedError ? err : new UnauthorizedError('Token invalide ou expiré'));
  }
}

export function requireOrganization(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!req.user?.organizationId && req.user?.role !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Organisation requise');
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError();
      if (req.user.role === UserRole.SUPER_ADMIN) return next();
      if (!roles.includes(req.user.role)) {
        throw new ForbiddenError('Permissions insuffisantes');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getOrganizationId(req: Request): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new UnauthorizedError('Organisation requise');
  return orgId;
}
