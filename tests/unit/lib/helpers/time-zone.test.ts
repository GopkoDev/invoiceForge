// T22 (spec.md §5 AC-27, adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md) —
// day boundaries and "current month" use the validated browser time zone from the `tz` cookie,
// falling back to UTC; range ends are exclusive at the next local midnight (sad.md §8, Hard
// rule "Time and time zones", verbatim).
//
// test-plan.md row AC-27 "day bounds are local and the end day is inclusive" (unit): for zones
// east and west of UTC and a DST-change day, the range covers local 00:00 on the start day up
// to (but not including) local 00:00 after the end day. Per "Test data — Time": zones are
// passed explicitly, never the machine's TZ.
//
// Checklist (task file): `getRequestTimeZone()` (reads cookies(), validates with
// `Intl.DateTimeFormat(undefined, { timeZone })` in try/catch, falls back to `UTC`),
// `startOfLocalDay(date, tz)`, `localDayRange(from, to, tz)` -> `[start, nextMidnightAfter(to))`,
// `currentLocalMonth(tz)` — lib/helpers/time-zone.ts.
//
// DoD scratch run (task file): localDayRange('2026-09-01','2026-09-30','Europe/Kyiv') ends at
// 2026-09-30T21:00:00Z (exclusive) and DST-edge days are 23/25 h. Scratch-check DST edges:
// Europe/Kyiv 2026-10-25, America/New_York 2026-11-01.
import { describe, expect, it, vi, beforeEach } from 'vitest';

// getRequestTimeZone() reads the `tz` cookie via next/headers' cookies(); this seam lets the
// test drive the cookie value directly rather than running inside a real request.
const cookiesMock = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
}));

import {
  getRequestTimeZone,
  startOfLocalDay,
  localDayRange,
  currentLocalMonth,
} from '@/lib/helpers/time-zone';

describe('getRequestTimeZone (unit, AC-27)', () => {
  beforeEach(() => {
    cookiesMock.mockReset();
  });

  it('accepts a valid IANA zone from the tz cookie', async () => {
    cookiesMock.mockReturnValue({
      get: (name: string) => (name === 'tz' ? { value: 'Europe/Kyiv' } : undefined),
    });

    await expect(getRequestTimeZone()).resolves.toBe('Europe/Kyiv');
  });

  it('falls back to UTC and never throws for a tampered cookie value', async () => {
    cookiesMock.mockReturnValue({
      get: (name: string) => (name === 'tz' ? { value: 'Mars/Base' } : undefined),
    });

    await expect(getRequestTimeZone()).resolves.toBe('UTC');
  });

  it('falls back to UTC and never throws for a garbage/oversized cookie value', async () => {
    cookiesMock.mockReturnValue({
      get: (name: string) =>
        name === 'tz' ? { value: 'A'.repeat(5000) } : undefined,
    });

    await expect(getRequestTimeZone()).resolves.toBe('UTC');
  });

  it('falls back to UTC when the cookie is missing (first render)', async () => {
    cookiesMock.mockReturnValue({
      get: () => undefined,
    });

    await expect(getRequestTimeZone()).resolves.toBe('UTC');
  });
});

describe('startOfLocalDay (unit, AC-27)', () => {
  it('returns the UTC instant of local midnight east of UTC', () => {
    // Europe/Kyiv is UTC+3 in September (EEST).
    const start = startOfLocalDay(new Date('2026-09-15T10:00:00.000Z'), 'Europe/Kyiv');
    expect(start.toISOString()).toBe('2026-09-14T21:00:00.000Z');
  });

  it('returns the UTC instant of local midnight west of UTC', () => {
    // America/New_York is UTC-4 in September (EDT).
    const start = startOfLocalDay(new Date('2026-09-15T10:00:00.000Z'), 'America/New_York');
    expect(start.toISOString()).toBe('2026-09-15T04:00:00.000Z');
  });

  it('handles a +14 zone (Pacific/Kiritimati)', () => {
    const start = startOfLocalDay(new Date('2026-09-15T10:00:00.000Z'), 'Pacific/Kiritimati');
    expect(start.toISOString()).toBe('2026-09-15T10:00:00.000Z');
  });

  it('handles a -12 zone (Etc/GMT+12)', () => {
    // Etc/GMT+12 is UTC-12 (POSIX sign), so 10:00Z on the 15th is 22:00 on the 14th locally;
    // that local day starts at 00:00 local = 12:00Z on the 14th.
    const start = startOfLocalDay(new Date('2026-09-15T10:00:00.000Z'), 'Etc/GMT+12');
    expect(start.toISOString()).toBe('2026-09-14T12:00:00.000Z');
  });
});

describe('localDayRange (unit, AC-27 — inclusive local range, exclusive next-midnight end)', () => {
  it('DoD scratch run: Europe/Kyiv 2026-09-01..2026-09-30 ends exclusive at 2026-09-30T21:00:00Z', () => {
    const [start, end] = localDayRange('2026-09-01', '2026-09-30', 'Europe/Kyiv');

    expect(start.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('includes an invoice issued at local 23:59:59.999 on the last day of the range', () => {
    const [, end] = localDayRange('2026-09-01', '2026-09-30', 'Europe/Kyiv');
    const lastMoment = new Date('2026-09-30T20:59:59.999Z'); // 23:59:59.999 Kyiv time

    expect(lastMoment.getTime()).toBeLessThan(end.getTime());
  });

  it('excludes an invoice issued at local 00:00:00.000 the day after the range', () => {
    const [, end] = localDayRange('2026-09-01', '2026-09-30', 'Europe/Kyiv');
    const nextDayMidnight = new Date('2026-09-30T21:00:00.000Z'); // Oct 1 00:00 Kyiv time

    expect(nextDayMidnight.getTime()).toBe(end.getTime());
  });

  it('a DST fall-back day (Europe/Kyiv 2026-10-25) spans 25 hours', () => {
    const [start, end] = localDayRange('2026-10-25', '2026-10-25', 'Europe/Kyiv');
    const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);

    expect(hours).toBe(25);
  });

  it('a DST spring-forward day (America/New_York 2026-03-08) spans 23 hours', () => {
    const [start, end] = localDayRange('2026-03-08', '2026-03-08', 'America/New_York');
    const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);

    expect(hours).toBe(23);
  });

  it('a DST fall-back day (America/New_York 2026-11-01) spans 25 hours', () => {
    const [start, end] = localDayRange('2026-11-01', '2026-11-01', 'America/New_York');
    const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);

    expect(hours).toBe(25);
  });

  it('handles a +14 zone (Pacific/Kiritimati) single-day range as a plain 24h day', () => {
    const [start, end] = localDayRange('2026-09-15', '2026-09-15', 'Pacific/Kiritimati');
    const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);

    expect(hours).toBe(24);
  });

  it('handles a -12 zone (Etc/GMT+12) single-day range as a plain 24h day', () => {
    const [start, end] = localDayRange('2026-09-15', '2026-09-15', 'Etc/GMT+12');
    const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);

    expect(hours).toBe(24);
  });
});

describe('currentLocalMonth (unit, AC-25/AC-27 fallback support)', () => {
  it('returns the month bounds for the given zone, not the machine zone', () => {
    // A fixed instant just after local midnight in Pacific/Kiritimati (UTC+14) that is still
    // the previous UTC day — proves the month is computed from the passed zone, not from UTC.
    const now = new Date('2026-08-31T11:00:00.000Z'); // 2026-09-01T01:00 in Kiritimati
    const [start, end] = currentLocalMonth('Pacific/Kiritimati', now);

    expect(start.toISOString()).toBe('2026-08-31T10:00:00.000Z'); // 2026-09-01T00:00 Kiritimati
    expect(end.toISOString()).toBe('2026-09-30T10:00:00.000Z'); // 2026-10-01T00:00 Kiritimati
  });

  it('falls back to UTC month bounds when no zone is given', () => {
    const now = new Date('2026-02-10T12:00:00.000Z');
    const [start, end] = currentLocalMonth('UTC', now);

    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});
