import { Router } from 'express';
import { container } from 'tsyringe';
import authRoutes from '../modules/auth/auth.routes.js';
import onboardingRoutes from '../modules/onboarding/onboarding.routes.js';
import invitationRoutes from '../modules/invitations/invitation.routes.js';
import buildingRoutes from '../modules/buildings/building.routes.js';
import apartmentRoutes from '../modules/apartments/apartment.routes.js';
import tenantRoutes from '../modules/tenants/tenant.routes.js';
import leaseRoutes from '../modules/leases/lease.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import documentRoutes from '../modules/documents/document.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import maintenanceRoutes from '../modules/maintenance/maintenance.routes.js';
import subscriptionRoutes from '../modules/subscriptions/subscription.routes.js';
import automationRoutes from '../modules/automation/automation.routes.js';
import aiRoutes from '../modules/ai/ai.routes.js';
import adminRoutes from '../modules/features/feature.admin.index.js';
import listingRoutes from '../modules/listings/listing.routes.js';
import applicationRoutes from '../modules/applications/application.routes.js';
import platformRoutes from '../modules/platform/platform.routes.js';
import auditRoutes from '../modules/audit/audit.routes.js';
import rbacRoutes from '../modules/rbac/rbac.routes.js';
import technicianRoutes from '../modules/technician/technician.routes.js';
import portalRoutes from '../modules/portal/portal.routes.js';
import notificationRoutes from '../modules/notifications/notification.routes.js';
import notificationCenterRoutes from '../modules/notification-center/notification-center.routes.js';
import inspectionRoutes from '../modules/inspections/inspection.routes.js';
import { PrismaService } from '../infrastructure/prisma/prisma.service.js';

/** Priorité : APP_VERSION (start-prod) → npm_package_version → fallback RC */
const APP_VERSION =
  process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.8.0';
const router = Router();

router.get('/health', async (_req, res) => {
  const uptime = Math.floor(process.uptime());
  const environment = process.env.NODE_ENV ?? 'development';
  let database: 'connected' | 'disconnected' = 'disconnected';

  try {
    const prisma = container.resolve(PrismaService);
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('health db timeout')), 2500);
      }),
    ]);
    database = 'connected';
  } catch {
    database = 'disconnected';
  }

  const ok = database === 'connected';
  // HTTP 200 = process vivant (Railway healthcheck). status/database = contrat RC.
  const body = {
    status: ok ? 'ok' : 'degraded',
    version: APP_VERSION,
    database,
    uptime,
    environment,
    success: ok,
    message: ok ? 'ITC API opérationnelle' : 'ITC API — base de données inaccessible',
    timestamp: new Date().toISOString(),
    uptimeSec: uptime,
    env: environment,
  };

  res.status(200).json(body);
});

router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'ITC API — utilisez /health pour tester la connexion',
    version: 'v1',
    endpoints: {
      health: '/api/v1/health',
      login: 'POST /api/v1/auth/login',
      dashboard: 'GET /api/v1/dashboard/stats',
    },
  });
});

router.use('/auth', authRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/invitations', invitationRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/automation', automationRoutes);
router.use('/ai', aiRoutes);
router.use('/admin', adminRoutes);
router.use('/buildings', buildingRoutes);
router.use('/apartments', apartmentRoutes);
router.use('/tenants', tenantRoutes);
router.use('/leases', leaseRoutes);
router.use('/payments', paymentRoutes);
router.use('/documents', documentRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/listings', listingRoutes);
router.use('/applications', applicationRoutes);
router.use('/platform', platformRoutes);
router.use('/audit', auditRoutes);
router.use('/rbac', rbacRoutes);
router.use('/technician', technicianRoutes);
router.use('/portal', portalRoutes);
router.use('/notifications', notificationRoutes);
router.use('/notification-center', notificationCenterRoutes);
router.use('/inspections', inspectionRoutes);

export default router;
