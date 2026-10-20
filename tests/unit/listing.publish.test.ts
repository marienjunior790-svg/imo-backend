import { ApartmentStatus } from '@prisma/client';
import {
  assertApartmentPublishable,
  assertRemainsPublishableIfPublished,
} from '../../src/modules/listings/publish-guards';
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

describe('Annonce déjà publiée — conservation publiabilité (Data Quality)', () => {
  const published = {
    isPublished: true,
    status: ApartmentStatus.AVAILABLE,
    rooms: 2,
  };

  it('autorise un update neutre (label/loyer) sans toucher rooms', () => {
    expect(() => assertRemainsPublishableIfPublished(published, {})).not.toThrow();
  });

  it('autorise rooms ≥ 1 sur une annonce publiée', () => {
    expect(() =>
      assertRemainsPublishableIfPublished(published, { rooms: 3 }),
    ).not.toThrow();
  });

  it('refuse de vider rooms sur une annonce publiée', () => {
    expect(() =>
      assertRemainsPublishableIfPublished(published, { rooms: null }),
    ).toThrow(ValidationError);
  });

  it('refuse rooms < 1 sur une annonce publiée', () => {
    expect(() =>
      assertRemainsPublishableIfPublished(published, { rooms: 0 }),
    ).toThrow(ValidationError);
  });

  it('refuse de passer OCCUPIED tout en restant publié', () => {
    expect(() =>
      assertRemainsPublishableIfPublished(published, { status: ApartmentStatus.OCCUPIED }),
    ).toThrow(ValidationError);
  });

  it('n’impose rien si l’annonce n’est pas publiée (brouillon rooms null OK)', () => {
    expect(() =>
      assertRemainsPublishableIfPublished(
        { isPublished: false, status: ApartmentStatus.AVAILABLE, rooms: null },
        {},
      ),
    ).not.toThrow();
  });
});
