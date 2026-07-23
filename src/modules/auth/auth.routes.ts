import { Router } from 'express';
import { container } from 'tsyringe';
import { AuthService } from './auth.service.js';
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  registerTenantSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mfaVerifySchema,
  mfaDisableSchema,
} from './auth.schema.js';
import { authenticatedPipeline } from '../../shared/middleware/security.stack.js';
import { authRateLimit, authStrictRateLimit } from '../../shared/middleware/auth-rate-limit.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';

const router = Router();
const authService = container.resolve(AuthService);

function clientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}

function userAgent(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 255) : undefined;
}

router.post(
  '/register',
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    sendSuccess(res, result, 'Compte organisation créé', 201);
  }),
);

router.post(
  '/register-tenant',
  authRateLimit,
  validateBody(registerTenantSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.registerTenant(req.body);
    sendSuccess(res, result, 'Compte locataire créé', 201);
  }),
);

router.post(
  '/login',
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, {
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    });
    if ('mfaRequired' in result && result.mfaRequired === true && !('accessToken' in result)) {
      sendSuccess(res, result, 'Code MFA requis');
      return;
    }
    sendSuccess(res, result, 'Connexion réussie');
  }),
);

router.post(
  '/refresh',
  authStrictRateLimit,
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.refresh(req.body.refreshToken, {
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    });
    sendSuccess(res, tokens, 'Token renouvelé');
  }),
);

router.post(
  '/logout',
  validateBody(logoutSchema),
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken, {
      userId: req.user?.userId,
      userRole: req.user?.role,
      organizationId: req.user?.organizationId,
      ipAddress: clientIp(req),
    });
    sendSuccess(res, null, 'Déconnexion réussie');
  }),
);

router.get(
  '/me',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const result = await authService.me(req.user!.userId);
    sendSuccess(res, result);
  }),
);

router.get(
  '/me/capabilities',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const result = await authService.me(req.user!.userId);
    sendSuccess(res, {
      capabilities: result.capabilities,
      membership: result.membership,
    });
  }),
);

router.get(
  '/me/modules',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const result = await authService.me(req.user!.userId);
    sendSuccess(res, { modules: result.modules });
  }),
);

router.post(
  '/change-password',
  ...authenticatedPipeline,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.changePassword(
      req.user!.userId,
      req.body.currentPassword,
      req.body.newPassword,
      { ipAddress: clientIp(req) },
    );
    sendSuccess(res, null, 'Mot de passe mis à jour');
  }),
);

// ─── P4 Identity & Security ─────────────────────────────────────────────────

router.post(
  '/forgot-password',
  authStrictRateLimit,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.email, { ipAddress: clientIp(req) });
    sendSuccess(res, result, 'Si un compte existe, un email a été envoyé');
  }),
);

router.post(
  '/reset-password',
  authStrictRateLimit,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body.token, req.body.newPassword, {
      ipAddress: clientIp(req),
    });
    sendSuccess(res, result, 'Mot de passe réinitialisé');
  }),
);

router.get(
  '/sessions',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const refreshHeader = req.headers['x-refresh-token'];
    const current =
      typeof refreshHeader === 'string'
        ? refreshHeader
        : typeof req.query.refreshToken === 'string'
          ? req.query.refreshToken
          : undefined;
    const sessions = await authService.listSessions(req.user!.userId, current);
    sendSuccess(res, { sessions });
  }),
);

router.delete(
  '/sessions/:id',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const result = await authService.revokeSession(req.user!.userId, req.params.id!, {
      ipAddress: clientIp(req),
      role: req.user!.role,
      organizationId: req.user!.organizationId,
    });
    sendSuccess(res, result, 'Session révoquée');
  }),
);

router.delete(
  '/sessions',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const result = await authService.revokeAllSessions(req.user!.userId, {
      ipAddress: clientIp(req),
      role: req.user!.role,
      organizationId: req.user!.organizationId,
    });
    sendSuccess(res, result, 'Toutes les sessions révoquées');
  }),
);

router.post(
  '/mfa/setup',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const result = await authService.mfaSetup(req.user!.userId);
    sendSuccess(res, result, 'Configurez votre application TOTP');
  }),
);

router.post(
  '/mfa/verify',
  ...authenticatedPipeline,
  validateBody(mfaVerifySchema),
  asyncHandler(async (req, res) => {
    const result = await authService.mfaVerifyEnable(req.user!.userId, req.body.code);
    sendSuccess(res, result, 'MFA activé');
  }),
);

router.post(
  '/mfa/disable',
  ...authenticatedPipeline,
  validateBody(mfaDisableSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.mfaDisable(req.user!.userId, req.body.password, req.body.code, {
      ipAddress: clientIp(req),
    });
    sendSuccess(res, result, 'MFA désactivé');
  }),
);

router.get(
  '/security-events',
  ...authenticatedPipeline,
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const events = await authService.listSecurityEvents(req.user!.userId, limit);
    sendSuccess(res, { events });
  }),
);

export default router;
