import * as Sentry from '@sentry/node';
import { env } from '../../config/env.js';

let initialized = false;

export function initSentry(): void {
  const dsn = env.SENTRY_DSN;
  if (!dsn || initialized) return;

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.15 : 1.0,
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? undefined,
  });
  initialized = true;
  console.log('✅ Sentry initialisé');
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
    }
    Sentry.captureException(err);
  });
}

export { Sentry };
