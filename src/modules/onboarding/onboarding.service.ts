import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import type {
  CompleteStepBody,
  FirstPropertyBody,
  OnboardingStep,
  OnboardingStepKey,
  OrganizationOnboarding,
} from './onboarding.schema.js';
import { ONBOARDING_STEP_KEYS } from './onboarding.schema.js';

export function createInitialOnboarding(options?: { firstPropertyDone?: boolean }): OrganizationOnboarding {
  const firstDone = options?.firstPropertyDone === true;
  const steps: OnboardingStep[] = [
    { key: 'welcome', status: 'done', required: false },
    { key: 'first_property', status: firstDone ? 'done' : 'pending', required: true },
    { key: 'invite_collaborator', status: 'pending', required: false },
    { key: 'org_branding', status: 'pending', required: false },
    { key: 'invite_tenant', status: 'pending', required: false },
  ];
  return {
    version: 1,
    steps,
    completedAt: isOnboardingComplete(steps) ? new Date().toISOString() : null,
  };
}

export function isOnboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.every((s) => {
    if (s.required) return s.status === 'done';
    return s.status === 'done' || s.status === 'skipped';
  });
}

export function parseOnboarding(raw: unknown): OrganizationOnboarding | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as OrganizationOnboarding;
  if (obj.version !== 1 || !Array.isArray(obj.steps)) return null;
  return obj;
}

/** Snapshot additive pour login/me/register. null = pas d'onboarding à forcer (legacy). */
export function toOnboardingSnapshot(raw: unknown): {
  incomplete: boolean;
  completedAt: string | null;
  steps: OnboardingStep[];
  nextStep: OnboardingStepKey | null;
} | null {
  const state = parseOnboarding(raw);
  if (!state) return null;
  const incomplete = !isOnboardingComplete(state.steps);
  const next =
    state.steps.find((s) => s.status === 'pending' && s.required)?.key ??
    state.steps.find((s) => s.status === 'pending')?.key ??
    null;
  return {
    incomplete,
    completedAt: state.completedAt,
    steps: state.steps,
    nextStep: next,
  };
}

@injectable()
export class OnboardingService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async getForUser(userId: string, role: UserRole, organizationId: string | null) {
    if (role !== UserRole.ORG_ADMIN || !organizationId) {
      return { onboarding: null as ReturnType<typeof toOnboardingSnapshot> };
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, onboarding: true },
    });
    if (!org) throw new NotFoundError('Organisation introuvable');
    return {
      organizationId: org.id,
      organizationName: org.name,
      onboarding: toOnboardingSnapshot(org.onboarding),
    };
  }

  async completeStep(
    userId: string,
    role: UserRole,
    organizationId: string | null,
    stepKey: string,
    body: CompleteStepBody,
  ) {
    this.assertOrgAdmin(role, organizationId);
    if (!ONBOARDING_STEP_KEYS.includes(stepKey as OnboardingStepKey)) {
      throw new ValidationError('Étape d\'onboarding inconnue');
    }
    const key = stepKey as OnboardingStepKey;
    if (key === 'first_property' && body.skipped) {
      throw new ValidationError('La création du premier bien est obligatoire');
    }
    if (key === 'welcome') {
      throw new ValidationError('Étape déjà finalisée');
    }

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId! } });
    if (!org) throw new NotFoundError('Organisation introuvable');

    let state = parseOnboarding(org.onboarding) ?? createInitialOnboarding();
    if (key === 'org_branding' && body.displayName) {
      await this.prisma.organization.update({
        where: { id: org.id },
        data: { name: body.displayName },
      });
    }

    state = this.markStep(state, key, body.skipped ? 'skipped' : 'done');
    await this.persist(org.id, state);
    return { onboarding: toOnboardingSnapshot(state) };
  }

  async completeFirstProperty(
    userId: string,
    role: UserRole,
    organizationId: string | null,
    body: FirstPropertyBody,
  ) {
    this.assertOrgAdmin(role, organizationId);
    const orgId = organizationId!;

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundError('Organisation introuvable');

    const doorCount = body.doorCount ?? 1;
    const rent = body.defaultRentAmount ?? 0;

    const building = await this.prisma.$transaction(async (tx) => {
      const created = await tx.building.create({
        data: {
          organizationId: orgId,
          name: body.name,
          address: body.address,
          district: body.district,
          city: body.city ?? 'Brazzaville',
        },
      });

      for (let i = 0; i < doorCount; i++) {
        await tx.apartment.create({
          data: {
            organizationId: orgId,
            buildingId: created.id,
            label: `Porte ${i + 1}`,
            floor: Math.floor(i / 4),
            rentAmount: rent,
            status: ApartmentStatus.AVAILABLE,
          },
        });
      }
      return created;
    });

    let state = parseOnboarding(org.onboarding) ?? createInitialOnboarding();
    state = this.markStep(state, 'first_property', 'done');
    await this.persist(orgId, state);

    return {
      building: { id: building.id, name: building.name, address: building.address },
      onboarding: toOnboardingSnapshot(state),
    };
  }

  private assertOrgAdmin(role: UserRole, organizationId: string | null) {
    if (role !== UserRole.ORG_ADMIN || !organizationId) {
      throw new ForbiddenError('Onboarding réservé à l\'administrateur de l\'organisation');
    }
  }

  private markStep(
    state: OrganizationOnboarding,
    key: OnboardingStepKey,
    status: 'done' | 'skipped',
  ): OrganizationOnboarding {
    const steps = state.steps.map((s) => (s.key === key ? { ...s, status } : s));
    const completedAt = isOnboardingComplete(steps) ? new Date().toISOString() : null;
    return { version: 1, steps, completedAt };
  }

  private async persist(organizationId: string, state: OrganizationOnboarding) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { onboarding: state as unknown as Prisma.InputJsonValue },
    });
  }
}
