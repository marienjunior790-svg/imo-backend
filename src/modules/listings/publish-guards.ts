import { ApartmentStatus } from '@prisma/client';
import { ValidationError } from '../../shared/errors/app.error.js';

/** Champs minimaux pour juger la publiabilité catalogue / matching. */
export type PublishableApartment = {
  status: ApartmentStatus | string;
  rooms: number | null;
  rentAmount?: unknown;
};

/**
 * Contraintes de publication alignées sur le matching hard SQL :
 * sans `rooms`, toute demande avec `minRooms` exclut l’annonce (gte ignore NULL).
 */
export function assertApartmentPublishable(apt: PublishableApartment): void {
  if (apt.status !== ApartmentStatus.AVAILABLE && apt.status !== 'AVAILABLE') {
    throw new ValidationError('Seuls les biens disponibles peuvent être publiés');
  }
  if (apt.rooms == null || !Number.isFinite(apt.rooms) || apt.rooms < 1) {
    throw new ValidationError(
      'Indiquez le nombre de pièces avant de publier (requis pour le matching ITC Immobilier)',
    );
  }
}
