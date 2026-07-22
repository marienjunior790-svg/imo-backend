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
} from './auth.schema.js';
import { authenticatedPipeline } from '../../shared/middleware/security.stack.js';
import { authRateLimit } from '../../shared/middleware/auth-rate-limit.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';

const router = Router();
const authService = container.resolve(AuthService);

function clientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
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
    const result = await authService.login(req.body, { ipAddress: clientIp(req) });
    sendSuccess(res, result, 'Connexion réussie');
  }),
);

router.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.refresh(req.body.refreshToken);
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

export default router;
