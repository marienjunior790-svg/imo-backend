/**
 * Photos d'intervention — stockées dans MaintenanceTicket.photos (JSONB).
 * Format : { before: PhotoRef[], after: PhotoRef[] }
 */
export type PhotoPhase = 'BEFORE' | 'AFTER';

export interface PhotoRef {
  url: string;
  publicId: string;
  fileName?: string;
  uploadedById?: string;
  uploadedAt: string;
}

export interface TicketPhotos {
  before: PhotoRef[];
  after: PhotoRef[];
}

export const EMPTY_TICKET_PHOTOS: TicketPhotos = { before: [], after: [] };

function toRefs(value: unknown): PhotoRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is PhotoRef =>
      typeof item === 'object' && item !== null && typeof (item as PhotoRef).url === 'string',
  );
}

export function parseTicketPhotos(raw: unknown): TicketPhotos {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_TICKET_PHOTOS };
  const record = raw as Record<string, unknown>;
  return { before: toRefs(record.before), after: toRefs(record.after) };
}

export function appendTicketPhoto(raw: unknown, phase: PhotoPhase, photo: PhotoRef): TicketPhotos {
  const current = parseTicketPhotos(raw);
  const key = phase === 'BEFORE' ? 'before' : 'after';
  return { ...current, [key]: [...current[key], photo] };
}

export function photoCount(raw: unknown): number {
  const photos = parseTicketPhotos(raw);
  return photos.before.length + photos.after.length;
}
