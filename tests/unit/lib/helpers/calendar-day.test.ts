// T25 (spec.md §1 "a due date is a calendar day", §5 AC-12, AC-23; review-2026-10-05 F-02) — an
// issue or due date is stored as the picked calendar day at T00:00:00Z. These helpers convert
// between that stored value, the `yyyy-MM-dd` the editor sends, and the local Date the Calendar
// shows, so the same Y/M/D appears in every browser zone.
import { afterEach, describe, expect, it } from 'vitest';
import {
  addDaysToDay,
  dayToUtcDate,
  formatStoredDay,
  localDateToDay,
  storedDayToLocalDate,
  utcDateToDay,
  utcDayRange,
} from '@/lib/helpers/calendar-day';

const ORIGINAL_TZ = process.env.TZ;

function inZone<T>(zone: string, fn: () => T): T {
  process.env.TZ = zone;
  return fn();
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('calendar-day helpers (AC-12, AC-23)', () => {
  it('dayToUtcDate stores a day at T00:00:00Z and utcDateToDay reads it back', () => {
    expect(dayToUtcDate('2026-10-15').toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(utcDateToDay(new Date('2026-10-15T00:00:00.000Z'))).toBe('2026-10-15');
  });

  it.each(['Europe/Kyiv', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Etc/GMT+12'])(
    'the day picked as local midnight in %s is sent as that same day',
    (zone) => {
      expect(inZone(zone, () => localDateToDay(new Date(2026, 9, 15)))).toBe('2026-10-15');
      // Any time of day on the picked day is the same day (the default "now" has a time).
      expect(inZone(zone, () => localDateToDay(new Date(2026, 9, 15, 23, 59, 59)))).toBe('2026-10-15');
    },
  );

  it.each(['Europe/Kyiv', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Etc/GMT+12'])(
    'a stored UTC-midnight day shows the same Y/M/D as a local Date in %s',
    (zone) => {
      const local = inZone(zone, () => storedDayToLocalDate(new Date('2026-10-15T00:00:00.000Z')));
      expect(inZone(zone, () => [local.getFullYear(), local.getMonth(), local.getDate()])).toEqual([2026, 9, 15]);
    },
  );

  it('formatStoredDay formats in UTC, so a browser west of UTC does not show the previous day', () => {
    const stored = new Date('2026-10-01T00:00:00.000Z');
    const opts = { year: 'numeric', month: 'short', day: 'numeric' } as const;
    expect(inZone('America/Los_Angeles', () => formatStoredDay(stored, opts))).toBe('Oct 1, 2026');
    expect(inZone('Pacific/Kiritimati', () => formatStoredDay(stored, opts))).toBe('Oct 1, 2026');
    // The same value after a server-to-client round trip as an ISO string.
    expect(inZone('America/Los_Angeles', () => formatStoredDay('2026-10-01T00:00:00.000Z', opts))).toBe('Oct 1, 2026');
  });

  it('addDaysToDay adds calendar days across month ends, with no hour arithmetic', () => {
    expect(addDaysToDay('2026-10-15', 30)).toBe('2026-11-14');
    expect(addDaysToDay('2026-12-15', 30)).toBe('2027-01-14');
    expect(addDaysToDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('utcDayRange is [start of from, start of the day after to) in UTC', () => {
    const [start, end] = utcDayRange('2026-10-01', '2026-10-31');
    expect(start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
