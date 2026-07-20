import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { sendError } from '../utils/response.util.js';
import { captureException } from '../../infrastructure/monitoring/sentry.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.query = schema.parse(req.query) as Request['query'];
    next();
  };
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  captureException(err, { path: req.path, method: req.method });
  sendError(res, err);
}
