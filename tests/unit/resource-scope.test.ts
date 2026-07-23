import { assertSameOrganization } from '../../src/shared/auth/resource-scope.js';
import { ForbiddenError } from '../../src/shared/errors/app.error.js';

describe('assertSameOrganization (TECH-002 unité)', () => {
  it('autorise même organisation', () => {
    expect(() => assertSameOrganization('org-a', 'org-a')).not.toThrow();
  });

  it('refuse org différente', () => {
    expect(() => assertSameOrganization('org-a', 'org-b')).toThrow(ForbiddenError);
  });

  it('refuse user sans organizationId', () => {
    expect(() => assertSameOrganization('org-a', null)).toThrow(ForbiddenError);
    expect(() => assertSameOrganization('org-a', undefined)).toThrow(ForbiddenError);
  });
});
