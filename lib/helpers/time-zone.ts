// T22 (spec.md §5 AC-27, adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md) —
// day boundaries and "current month" use the validated browser time zone carried in the `tz`
// cookie, falling back to UTC; range ends are exclusive at the next local midnight (sad.md §8,
// Hard rule "Time and time zones"). Intl-only: no new dependency.
//
// Only `getRequestTimeZone` needs a request scope (via next/headers' `cookies()`); the pure
// day-bound helpers below take the zone as a plain string and can be called from anywhere.
import { cookies } from 'next/headers';

const MAX_TZ_COOKIE_LENGTH = 100;
const FALLBACK_TIME_ZONE = 'UTC';

/**
 * Reads the browser-reported `tz` cookie set by the `TimeZoneCookie` client island and
 * validates it against `Intl`. Falls back to UTC for a missing, tampered, or oversized value —
 * never throws.
 */
export async function getRequestTimeZone(): Promise<string> {
  const store = await cookies();
  const value = store.get('tz')?.value;

  if (!value || value.length > MAX_TZ_COOKIE_LENGTH) {
    return FALLBACK_TIME_ZONE;
  }

  try {
    // Throws a RangeError for an unknown IANA zone (e.g. a tampered cookie value).
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

type ZonedParts = {
  year: number;
  month: number; // 1-based
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl reports hour 24 for midnight under hourCycle 'h23' in some environments; normalize.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** The zone's offset from UTC, in milliseconds, evaluated at the given instant (DST-aware). */
function getZoneOffsetMs(instantMs: number, timeZone: string): number {
  const { year, month, day, hour, minute, second } = getZonedParts(new Date(instantMs), timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - instantMs;
}

/** Whether the zone's wall clock at `instantMs` reads exactly the given calendar date/time. */
function wallClockMatches(
  instantMs: number,
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  const parts = getZonedParts(new Date(instantMs), timeZone);
  return (
    parts.year === year &&
    parts.month === month &&
    parts.day === day &&
    parts.hour === hour &&
    parts.minute === minute &&
    parts.second === second
  );
}

/**
 * Converts a calendar date/time as observed in `timeZone` to the UTC instant it represents.
 * Iterates the offset up to twice, checking the wall clock each guess actually produces (not
 * just whether the offset stabilized — F-30, review-2026-09-27), so it lands on the correct
 * instant even when the desired wall-clock time is ambiguous (a fall-back repeats it).
 *
 * A handful of zones (e.g. America/Santiago, America/Havana) spring their clocks forward at
 * local midnight, so local midnight itself does not exist there on a transition day — the wall
 * clock jumps straight from 23:59:59 to 01:00:00. Neither guess can reproduce a nonexistent wall
 * clock, and in that gap case this resolves to the transition instant itself (the first guess,
 * computed from the offset in effect just before the desired time), which is the earliest
 * instant whose local day is the requested one.
 */
function zonedTimeToUtc(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const candidateMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = getZoneOffsetMs(candidateMs, timeZone);
  const guess1Ms = candidateMs - offset1;

  if (wallClockMatches(guess1Ms, timeZone, year, month, day, hour, minute, second)) {
    return new Date(guess1Ms);
  }

  const offset2 = getZoneOffsetMs(guess1Ms, timeZone);
  const guess2Ms = candidateMs - offset2;

  if (wallClockMatches(guess2Ms, timeZone, year, month, day, hour, minute, second)) {
    return new Date(guess2Ms);
  }

  // Neither guess reproduces the requested wall clock: it falls in a spring-forward gap.
  // Resolve to the transition instant (guess1Ms), the earliest instant on the requested day.
  return new Date(guess1Ms);
}

/** The UTC instant of local midnight, on the local calendar day that `date` falls on in `timeZone`. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const { year, month, day } = getZonedParts(date, timeZone);
  return zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone);
}

function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

/**
 * `[start, end)` for the local calendar range `from`..`to` inclusive, in `timeZone`. `end` is
 * the exclusive UTC instant of the next local midnight after `to`.
 */
export function localDayRange(from: string, to: string, timeZone: string): [Date, Date] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);

  const startDate = zonedTimeToUtc(start.year, start.month, start.day, 0, 0, 0, timeZone);
  // Date.UTC normalizes an overflowing day (e.g. month 9, day 31) into the following month,
  // giving us the calendar date one day after `to` without any manual carry logic.
  const nextDayMs = Date.UTC(end.year, end.month - 1, end.day + 1);
  const nextDay = new Date(nextDayMs);
  const endDate = zonedTimeToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );

  return [startDate, endDate];
}

/**
 * `[start, end)` for the local calendar month containing `now` (defaults to the current instant),
 * in `timeZone`. `end` is the exclusive UTC instant of the following month's local midnight.
 */
export function currentLocalMonth(timeZone: string, now: Date = new Date()): [Date, Date] {
  const { year, month } = getZonedParts(now, timeZone);

  const start = zonedTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
  // Month index 12 (1-based) overflows into January of the next year via Date.UTC's normal
  // month-overflow handling, so no explicit year rollover is needed here either.
  const end = zonedTimeToUtc(year, month + 1, 1, 0, 0, 0, timeZone);

  return [start, end];
}

// T38 (spec.md §5 AC-25, review-2026-09-27 F-31) — the dashboard chart groups paid/planned
// amounts by the local calendar day so a users east/west of UTC see their own day boundaries,
// not the server's. `yyyy-MM-dd` is lexicographically ordered, so callers can compare these keys
// with plain string operators instead of re-parsing them into Dates.
/** The `yyyy-MM-dd` calendar date that `date` falls on in `timeZone`. */
export function formatLocalDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = getZonedParts(date, timeZone);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
