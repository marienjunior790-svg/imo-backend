/** Pure helpers for Phase F analytics — unit-testable without Prisma. */

export type CalendarPeriod = { month: number; year: number };

export type RevenueDirection = 'up' | 'down' | 'flat';

export function utcThisMonth(now: Date = new Date()): CalendarPeriod {
  return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
}

export function utcLastMonth(now: Date = new Date()): CalendarPeriod {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

/** Remaining due = amount − amountPaid, never negative. */
export function remainingXaf(amount: number, amountPaid: number): number {
  const a = Number.isFinite(amount) ? amount : 0;
  const p = Number.isFinite(amountPaid) ? amountPaid : 0;
  return Math.max(0, a - p);
}

/**
 * Occupancy rate 0–100 with 1 decimal.
 * Empty parc → 0 (never NaN).
 */
export function occupancyRatePct(occupiedUnits: number, unitsCount: number): number {
  if (!unitsCount || unitsCount <= 0) return 0;
  const occ = Math.max(0, occupiedUnits);
  return Math.round((occ / unitsCount) * 1000) / 10;
}

export function revenueDelta(
  revenueA: number,
  revenueB: number,
): { deltaXaf: number; deltaPct: number | null; direction: RevenueDirection } {
  const a = Number.isFinite(revenueA) ? revenueA : 0;
  const b = Number.isFinite(revenueB) ? revenueB : 0;
  const deltaXaf = b - a;
  const deltaPct = a === 0 ? null : Math.round((deltaXaf / a) * 1000) / 10;
  let direction: RevenueDirection = 'flat';
  if (deltaXaf > 0) direction = 'up';
  else if (deltaXaf < 0) direction = 'down';
  return { deltaXaf, deltaPct, direction };
}

/** UTC month bounds for paidAt filters (inclusive start, exclusive end). */
export function utcMonthBounds(period: CalendarPeriod): { start: Date; endExclusive: Date } {
  const start = new Date(Date.UTC(period.year, period.month - 1, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(period.year, period.month, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

export function periodLabel(period: CalendarPeriod): string {
  return `${String(period.month).padStart(2, '0')}/${period.year}`;
}
