import { MaintenanceTicketStatus } from '@prisma/client';
import { ValidationError } from '../../src/shared/errors/app.error.js';
import {
  assertAgentAcceptStatus,
  assertAgentCompleteStatus,
  assertAgentStartStatus,
} from '../../src/modules/maintenance/maintenance.transitions.js';
import { requirePasswordChangedMiddleware } from '../../src/shared/middleware/password-change.middleware.js';
import {
  adminUsersPipeline,
  authenticatedPipeline,
  platformAdminPipeline,
  orgStaffPipeline,
  tenantPipeline,
  maintenanceAgentPipeline,
} from '../../src/shared/middleware/security.stack.js';
import { authenticatedStack } from '../../src/shared/middleware/auth.stack.js';

describe('Maintenance agent lifecycle guards', () => {
  it('acceptJob autorise OPEN et ASSIGNED uniquement', () => {
    expect(() => assertAgentAcceptStatus(MaintenanceTicketStatus.OPEN)).not.toThrow();
    expect(() => assertAgentAcceptStatus(MaintenanceTicketStatus.ASSIGNED)).not.toThrow();
    expect(() => assertAgentAcceptStatus(MaintenanceTicketStatus.IN_PROGRESS)).toThrow(ValidationError);
    expect(() => assertAgentAcceptStatus(MaintenanceTicketStatus.COMPLETED)).toThrow(ValidationError);
  });

  it('startForAgent uniquement depuis ASSIGNED', () => {
    expect(() => assertAgentStartStatus(MaintenanceTicketStatus.ASSIGNED)).not.toThrow();
    expect(() => assertAgentStartStatus(MaintenanceTicketStatus.OPEN)).toThrow(ValidationError);
    expect(() => assertAgentStartStatus(MaintenanceTicketStatus.IN_PROGRESS)).toThrow(ValidationError);
  });

  it('completeForAgent uniquement depuis IN_PROGRESS', () => {
    expect(() => assertAgentCompleteStatus(MaintenanceTicketStatus.IN_PROGRESS)).not.toThrow();
    expect(() => assertAgentCompleteStatus(MaintenanceTicketStatus.ASSIGNED)).toThrow(ValidationError);
    expect(() => assertAgentCompleteStatus(MaintenanceTicketStatus.COMPLETED)).toThrow(ValidationError);
  });
});

describe('Password gate pipelines', () => {
  it('authenticatedPipeline / platformAdmin / adminUsers incluent requirePasswordChanged', () => {
    expect(authenticatedPipeline).toContain(requirePasswordChangedMiddleware);
    expect(platformAdminPipeline).toContain(requirePasswordChangedMiddleware);
    expect(adminUsersPipeline).toContain(requirePasswordChangedMiddleware);
  });

  it('pipelines métier existants restent gated', () => {
    expect(orgStaffPipeline).toContain(requirePasswordChangedMiddleware);
    expect(tenantPipeline).toContain(requirePasswordChangedMiddleware);
    expect(maintenanceAgentPipeline).toContain(requirePasswordChangedMiddleware);
  });

  it('authenticatedStack (auth me/change-password/logout) n\'a pas le password gate', () => {
    expect(authenticatedStack).not.toContain(requirePasswordChangedMiddleware);
  });
});
