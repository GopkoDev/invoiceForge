// T25 (spec.md §1 "a due date is a calendar day", sad.md §8; review-2026-10-05 F-02, F-03) — an
// invoice's issue and due dates are calendar days. They are stored as `T00:00:00Z` of the day the
// Freelancer picked (the column stays timestamp), travel to the server as `yyyy-MM-dd`, and are
// compared and shown by that day alone, never shifted into a zone. Pure and framework-free: the
// editor (browser), the services and the schema all use it.

/** A calendar day, `yyyy-MM-dd`. */
export type CalendarDay = string;

export const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const p2 = (n: number) => String(n).padStart(2, '0');

/** True for a `yyyy-MM-dd` that names a real day (no 30 Feb). */
export function isCalendarDay(value: unknown): value is CalendarDay {
  if (typeof value !== 'string' || !CALENDAR_DAY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The stored value of a day: its UTC midnight. */
export function dayToUtcDate(day: CalendarDay): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** The day a stored value names: its UTC calendar day (any time of day is dropped). */
export function utcDateToDay(date: Date): CalendarDay {
  return date.toISOString().slice(0, 10);
}

/** The day a Calendar pick names: the browser's local Y/M/D of a local Date. */
export function localDateToDay(date: Date): CalendarDay {
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
}

/** A local-midnight Date showing the same Y/M/D as a stored day, in any browser zone (for the Calendar and date-fns). */
export function storedDayToLocalDate(stored: Date | string): Date {
  const d = typeof stored === 'string' ? new Date(stored) : stored;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** A local-midnight Date showing the Y/M/D of a `yyyy-MM-dd` day, in any browser zone (for the Calendar and date-fns). */
export function dayToLocalDate(day: CalendarDay): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** `toLocaleDateString` of a stored day, read in UTC so a browser west of UTC does not show the day before. */
export function formatStoredDay(stored: Date | string, options: Intl.DateTimeFormatOptions): string {
  return new Date(stored).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/** `day` plus `days` calendar days (DST-free: UTC arithmetic on whole days). */
export function addDaysToDay(day: CalendarDay, days: number): CalendarDay {
  const [y, m, d] = day.split('-').map(Number);
  return utcDateToDay(new Date(Date.UTC(y, m - 1, d + days)));
}

/** `[start of from, start of the day after to)` as stored values: every day from `from` to `to` inclusive. */
export function utcDayRange(from: CalendarDay, to: CalendarDay): [Date, Date] {
  return [dayToUtcDate(from), dayToUtcDate(addDaysToDay(to, 1))];
}
