import { ApartmentStatus } from '@prisma/client';
import { assertApartmentPublishable } from '../../src/modules/listings/publish-guards';
import { ValidationError } from '../../src/shared/errors/app.error';

describe('Publication annonce — garde-fous (Phase 0D suite)', () => {
  it('autorise AVAILABLE avec rooms ≥ 1', () => {
    expect(() =>
      assertApartmentPublishable({ status: ApartmentStatus.AVAILABLE, rooms: 1 }),
    ).not.toThrow();
  });

  it('refuse rooms null (cause prod sqlMatchCount=0 avec minRooms)', () => {
    expect(() =>
      assertApartmentPublishable({ status: ApartmentStatus.AVAILABLE, rooms: null }),
    ).toThrow(ValidationError);
    try {
      assertApartmentPublishable({ status: ApartmentStatus.AVAILABLE, rooms: null });
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).message).toMatch(/pièces/i);
    }
  });

  it('refuse rooms < 1', () => {
    expect(() =>
      assertApartmentPublishable({ status: ApartmentStatus.AVAILABLE, rooms: 0 }),
    ).toThrow(ValidationError);
  });

  it('refuse statut non AVAILABLE', () => {
    expect(() =>
      assertApartmentPublishable({ status: ApartmentStatus.OCCUPIED, rooms: 2 }),
    ).toThrow(ValidationError);
  });
});
