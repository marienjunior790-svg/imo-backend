import { MaintenanceTicketStatus } from '@prisma/client';
import { ValidationError } from '../../shared/errors/app.error.js';

/** acceptJob : OPEN | ASSIGNED → ASSIGNED */
export function assertAgentAcceptStatus(status: MaintenanceTicketStatus): void {
  if (status !== MaintenanceTicketStatus.OPEN && status !== MaintenanceTicketStatus.ASSIGNED) {
    throw new ValidationError('Cette mission ne peut plus être acceptée');
  }
}

/** refuseJob : OPEN | ASSIGNED uniquement (libère l'assignation) */
export function assertAgentRefuseStatus(status: MaintenanceTicketStatus): void {
  if (status !== MaintenanceTicketStatus.OPEN && status !== MaintenanceTicketStatus.ASSIGNED) {
    throw new ValidationError('Cette mission ne peut plus être refusée');
  }
}

/** startForAgent : uniquement depuis ASSIGNED */
export function assertAgentStartStatus(status: MaintenanceTicketStatus): void {
  if (status !== MaintenanceTicketStatus.ASSIGNED) {
    throw new ValidationError('Intervention démarrable uniquement depuis le statut « Assignée »');
  }
}

/** completeForAgent : uniquement depuis IN_PROGRESS → COMPLETED */
export function assertAgentCompleteStatus(status: MaintenanceTicketStatus): void {
  if (status !== MaintenanceTicketStatus.IN_PROGRESS) {
    throw new ValidationError('Intervention terminable uniquement depuis le statut « En cours »');
  }
}

/** closeForAgent : depuis COMPLETED (ou IN_PROGRESS via complete+close) → CLOSED */
export function assertAgentCloseStatus(status: MaintenanceTicketStatus): void {
  if (
    status !== MaintenanceTicketStatus.COMPLETED &&
    status !== MaintenanceTicketStatus.IN_PROGRESS
  ) {
    throw new ValidationError('Intervention clôturable uniquement une fois terminée');
  }
}
