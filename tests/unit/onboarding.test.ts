import {
  createInitialOnboarding,
  isOnboardingComplete,
  toOnboardingSnapshot,
} from '../../src/modules/onboarding/onboarding.service.js';

describe('Onboarding engine (P1)', () => {
  it('initialise avec premier bien en pending', () => {
    const state = createInitialOnboarding();
    expect(state.steps.find((s) => s.key === 'first_property')?.status).toBe('pending');
    expect(isOnboardingComplete(state.steps)).toBe(false);
    expect(toOnboardingSnapshot(state)?.incomplete).toBe(true);
    expect(toOnboardingSnapshot(state)?.nextStep).toBe('first_property');
  });

  it('marque first_property done si seed register', () => {
    const state = createInitialOnboarding({ firstPropertyDone: true });
    expect(state.steps.find((s) => s.key === 'first_property')?.status).toBe('done');
    expect(toOnboardingSnapshot(state)?.incomplete).toBe(true);
    expect(toOnboardingSnapshot(state)?.nextStep).toBe('invite_collaborator');
  });

  it('est complet quand requis done et optionnels skippés', () => {
    const state = createInitialOnboarding({ firstPropertyDone: true });
    state.steps = state.steps.map((s) =>
      s.required ? s : { ...s, status: 'skipped' as const },
    );
    expect(isOnboardingComplete(state.steps)).toBe(true);
    expect(toOnboardingSnapshot(state)?.incomplete).toBe(false);
  });

  it('legacy null = pas de gate', () => {
    expect(toOnboardingSnapshot(null)).toBeNull();
  });
});
