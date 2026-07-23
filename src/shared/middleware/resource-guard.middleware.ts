import { UserRole } from '@prisma/client';
import { container } from 'tsyringe';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { extendedPrisma } from '../utils/extended-prisma.js';
import { assertSameOrganization } from '../auth/resource-scope.js';
import { getOrganizationId } from './auth.middleware.js';
import { asyncHandler } from '../utils/response.util.js';
import { ForbiddenError, NotFoundError } from '../errors/app.error.js';

type OrgScopedModel =
  | 'building'
  | 'apartment'
  | 'tenant'
  | 'lease'
  | 'payment'
  | 'maintenanceTicket'
  | 'rentalApplication'
  | 'document'
  | 'propertyInspection';

/** Décision d’accès pour requireOrgResource (testable sans Express/Prisma). */
export type OrgResourceGate = 'bypass' | 'deny' | 'check';

/**
 * SUPER_ADMIN : accès plateforme.
 * TENANT : refusé ici — utiliser portal / requireApplicationAccess (ownership).
 * Autres rôles : vérifier organizationId de la ressource.
 */
export function orgResourceGateForRole(role: UserRole | undefined): OrgResourceGate {
  if (role === UserRole.SUPER_ADMIN) return 'bypass';
  if (role === UserRole.TENANT) return 'deny';
  return 'check';
}

async function findOrgId(model: OrgScopedModel, id: string): Promise<string | null> {
  const prisma = container.resolve(PrismaService);
  const args = { where: { id }, select: { organizationId: true } };

  switch (model) {
    case 'building':
      return (await prisma.building.findFirst(args))?.organizationId ?? null;
    case 'apartment':
      return (await prisma.apartment.findFirst(args))?.organizationId ?? null;
    case 'tenant':
      return (await prisma.tenant.findFirst(args))?.organizationId ?? null;
    case 'lease':
      return (await prisma.lease.findFirst(args))?.organizationId ?? null;
    case 'payment':
      return (await prisma.payment.findFirst(args))?.organizationId ?? null;
    case 'maintenanceTicket':
      return (await prisma.maintenanceTicket.findFirst(args))?.organizationId ?? null;
    case 'rentalApplication':
      return (await prisma.rentalApplication.findFirst(args))?.organizationId ?? null;
    case 'document':
      return (await prisma.document.findFirst(args))?.organizationId ?? null;
    case 'propertyInspection': {
      const record = (await extendedPrisma(prisma).propertyInspection.findFirst(args)) as {
        organizationId: string;
      } | null;
      return record?.organizationId ?? null;
    }
    default:
      return null;
  }
}

/**
 * Vérifie que la ressource identifiée par :param appartient à l'organisation de l'utilisateur.
 * À placer sur toutes les routes /:id sensibles (staff org).
 * Les locataires passent par /portal ou requireApplicationAccess — pas ce garde.
 */
export function requireOrgResource(model: OrgScopedModel, param = 'id') {
  return asyncHandler(async (req, res, next) => {
    const gate = orgResourceGateForRole(req.user?.role);
    if (gate === 'bypass') return next();
    if (gate === 'deny') {
      throw new ForbiddenError('Accès refusé — ressource hors périmètre');
    }

    const id = req.params[param];
    if (!id) return next();

    const resourceOrgId = await findOrgId(model, id);
    if (!resourceOrgId) throw new NotFoundError('Ressource introuvable');

    assertSameOrganization(resourceOrgId, getOrganizationId(req));
    next();
  });
}

/**
 * Vérifie qu'une candidature appartient au locataire connecté OU à son organisation (staff).
 */
export function requireApplicationAccess() {
  return asyncHandler(async (req, res, next) => {
    const u = req.user!;
    const id = req.params.id;
    if (!id) return next();

    const prisma = container.resolve(PrismaService);
    const app = await prisma.rentalApplication.findUnique({
      where: { id },
      select: { organizationId: true, applicantUserId: true },
    });
    if (!app) throw new NotFoundError('Demande introuvable');

    if (u.role === UserRole.TENANT) {
      if (app.applicantUserId !== u.userId) throw new NotFoundError('Demande introuvable');
      return next();
    }
    if (u.role !== UserRole.SUPER_ADMIN) {
      assertSameOrganization(app.organizationId, u.organizationId);
    }
    next();
  });
}
