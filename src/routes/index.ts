import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
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

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'ITC API opérationnelle',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    env: process.env.NODE_ENV ?? 'development',
  });
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
