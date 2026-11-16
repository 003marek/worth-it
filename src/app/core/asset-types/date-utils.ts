/**
 * Pure ISO date (yyyy-mm-dd) utilities.
 * Never uses local timezone methods — all date math is performed in UTC or lexicographically.
 */

/**
 * Normalizes an ISO date or timestamp string to its yyyy-mm-dd prefix.
 */
export function toIsoDate(isoDateOrTimestamp: string): string {
  return isoDateOrTimestamp.slice(0, 10);
}

/**
 * Lexicographic comparison of two ISO dates (yyyy-mm-dd).
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 */
export function compareIsoDates(a: string, b: string): number {
  const da = a.slice(0, 10);
  const db = b.slice(0, 10);
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}

/**
 * Adds a number of calendar months to an anchor yyyy-mm-dd date, clamping the day
 * to the last day of the target month (e.g. '2026-01-31' + 1 month -> '2026-02-28').
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [yStr, mStr, dStr] = isoDate.slice(0, 10).split('-');
  const year = Number(yStr);
  const monthIndex = Number(mStr) - 1;
  const day = Number(dStr);

  const totalMonths = year * 12 + monthIndex + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;

  const maxDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDay);

  const yOut = String(targetYear).padStart(4, '0');
  const mOut = String(targetMonthIndex + 1).padStart(2, '0');
  const dOut = String(clampedDay).padStart(2, '0');
  return `${yOut}-${mOut}-${dOut}`;
}

/**
 * Returns the signed integer number of days from `fromIso` to `toIso` (toIso - fromIso).
 */
export function daysBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = toIso.slice(0, 10).split('-').map(Number);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / msPerDay);
}
