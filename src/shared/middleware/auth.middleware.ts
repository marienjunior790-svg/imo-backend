import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../errors/app.error.js';
import { normalizeRole } from '../auth/roles.js';
import { AuthUser } from '../types/express.js';

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  /** P3 — membership active (optionnel, dual-compat) */
  mid?: string;
  /** Unique id for refresh tokens (évite collision tokenHash même seconde) */
  jti?: string;
}

export function signAccessToken(payload: JwtAccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: JwtAccessPayload): string {
  return jwt.sign(
    { ...payload, jti: payload.jti ?? randomBytes(16).toString('hex') },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    },
  );
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
      // Point de normalisation unique : les JWT legacy (ORG_ADMIN / TECHNICIAN)
      // deviennent OWNER / AGENT pour tout le reste de la chaîne.
      role: normalizeRole(payload.role),
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
    if (!req.user?.organizationId && normalizeRole(req.user?.role) !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Organisation requise');
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...roles: UserRole[]) {
  const allowed = new Set(roles.map(normalizeRole));
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const role = normalizeRole(req.user.role);
      if (role === UserRole.SUPER_ADMIN) return next();
      if (!allowed.has(role)) {
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
