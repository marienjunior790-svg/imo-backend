import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app.error.js';
import { SubscriptionError, PlanLimitError } from '../errors/subscription.error.js';
import { ApiResponse } from '../types/express.js';

export function sendSuccess<T>(res: Response, data: T, message?: string, status = 200, meta?: Record<string, unknown>): void {
  const body: ApiResponse<T> = { success: true, data, message, meta };
  res.status(status).json(body);
}

export function sendError(res: Response, error: unknown): void {
  if (error instanceof SubscriptionError || error instanceof PlanLimitError) {
    res.status(error.statusCode).json(error.toJSON());
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
    } satisfies ApiResponse);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Données invalides',
      code: 'VALIDATION_ERROR',
      meta: { errors: error.flatten().fieldErrors },
    } satisfies ApiResponse);
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    code: 'INTERNAL_ERROR',
  } satisfies ApiResponse);
}

export function asyncHandler(fn: (req: import('express').Request, res: Response, next: import('express').NextFunction) => Promise<void>) {
  return (req: import('express').Request, res: Response, next: import('express').NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function getPagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function toPaginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export function sanitizeUser<T extends Record<string, unknown>>(user: T): Omit<T, 'passwordHash' | 'mfaSecret' | 'mfaRecoveryHashes'> {
  const {
    passwordHash: _p,
    mfaSecret: _s,
    mfaRecoveryHashes: _r,
    ...rest
  } = user as T & {
    passwordHash?: string;
    mfaSecret?: string | null;
    mfaRecoveryHashes?: string[];
  };
  return rest as Omit<T, 'passwordHash' | 'mfaSecret' | 'mfaRecoveryHashes'>;
}

export function decimalToNumber(value: { toNumber?: () => number } | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}
