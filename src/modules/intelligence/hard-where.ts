import { ApartmentStatus, type Prisma } from '@prisma/client';
import type { DemandSpec } from './types.js';

/**
 * Contraintes hard exprimables en SQL — alignées sur filterEligible (eligibility.ts).
 * Les sémantiques non capturables en contains unidirectionnel restent appliquées ensuite
 * via filterEligible en mémoire (cityOk / districtOk bidirectionnels).
 */
export function buildHardApartmentWhere(demand: DemandSpec): Prisma.ApartmentWhereInput {
  const building: Prisma.BuildingWhereInput = {};

  if (demand.cities?.length) {
    building.OR = demand.cities.map((city) => ({
      city: { contains: city, mode: 'insensitive' as const },
    }));
  }

  if (demand.districts?.length) {
    const districtClause: Prisma.BuildingWhereInput = {
      OR: demand.districts.map((district) => ({
        district: { contains: district, mode: 'insensitive' as const },
      })),
    };
    if (building.OR) {
      const cityOr = building.OR;
      delete building.OR;
      building.AND = [{ OR: cityOr }, districtClause];
    } else {
      Object.assign(building, districtClause);
    }
  }

  const rent: Prisma.DecimalFilter = {};
  if (demand.maxRent != null) rent.lte = demand.maxRent;
  if (demand.minRent != null) rent.gte = demand.minRent;

  return {
    isPublished: true,
    status: ApartmentStatus.AVAILABLE,
    currency: demand.currency.toUpperCase(),
    organization: { isActive: true, isValidated: true },
    ...(Object.keys(rent).length ? { rentAmount: rent } : {}),
    ...(demand.minRooms != null ? { rooms: { gte: demand.minRooms } } : {}),
    ...(demand.minSurface != null ? { surface: { gte: demand.minSurface } } : {}),
    ...(Object.keys(building).length ? { building } : {}),
  };
}
