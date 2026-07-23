import rateLimit from 'express-rate-limit';

/** Limite les tentatives de connexion / inscription (anti brute-force). */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de tentatives. Réessayez dans 15 minutes.',
    code: 'RATE_LIMIT',
  },
});

/** Plus strict pour forgot-password / MFA / refresh. */
export const authStrictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de tentatives. Réessayez dans 15 minutes.',
    code: 'RATE_LIMIT',
  },
});
