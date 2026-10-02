// Shared five-year Dashboard period rule (ADR-0004). Pure and dependency-free: calendar-date
// string arithmetic only, so the link reader, the filter and the business layer agree on one
// boundary regardless of time zone.

export const MAX_CUSTOM_PERIOD_YEARS = 5;
export const PERIOD_TOO_LONG =
  'A custom period can be at most 5 years. Choose "All time" to see your full history.';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(2000, m - 1, d));
  date.setUTCFullYear(y);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Adds whole calendar years to a YYYY-MM-DD string; a 29 February start lands on 28 February. */
export function addCalendarYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const ny = y + years;
  const leap = (ny % 4 === 0 && ny % 100 !== 0) || ny % 400 === 0;
  const nd = m === 2 && d === 29 && !leap ? 28 : d;
  return `${pad(ny, 4)}-${pad(m, 2)}-${pad(nd, 2)}`;
}

/** True when both dates are real, from <= to, and to <= from + 5 calendar years. */
export function isWithinMaxCustomPeriod(from: string, to: string): boolean {
  if (!isRealDate(from) || !isRealDate(to) || from > to) return false;
  return to <= addCalendarYears(from, MAX_CUSTOM_PERIOD_YEARS);
}
