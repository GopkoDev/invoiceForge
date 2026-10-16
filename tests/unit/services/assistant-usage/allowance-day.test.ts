// T08 (ai-assistant; spec.md §5 AC-10, §8 time-zone rule, ADR-0009) - the pure day logic of the Daily
// message allowance: a new day starts at local midnight; a zone change never opens a new day earlier
// than 24 h after the first message of the row's day.
import { describe, expect, it } from 'vitest';

import { currentAllowanceDay } from '@/lib/services/assistant-usage/allowance';

const KYIV = 'Europe/Kyiv'; // UTC+3 in June 2026
const AUCKLAND = 'Pacific/Auckland'; // UTC+12 in June 2026

const row = (day: string, timeZone: string, firstMessageAt: string) => ({
  day: new Date(`${day}T00:00:00.000Z`),
  used: 5,
  timeZone,
  firstMessageAt: new Date(firstMessageAt),
});

describe('currentAllowanceDay(latestRow, zone, now)', () => {
  it('with no row, today is the local date and renews at the next local midnight', () => {
    const r = currentAllowanceDay(null, KYIV, new Date('2026-06-15T10:00:00Z'));
    expect(r.day.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(r.isNew).toBe(true);
    expect(r.renewsAt.toISOString()).toBe('2026-06-15T21:00:00.000Z');
  });

  it('the row stays current one second before midnight in Kyiv', () => {
    const latest = row('2026-06-15', KYIV, '2026-06-15T08:00:00Z');
    const r = currentAllowanceDay(latest, KYIV, new Date('2026-06-15T20:59:59Z'));
    expect(r.isNew).toBe(false);
    expect(r.day.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(r.renewsAt.toISOString()).toBe('2026-06-15T21:00:00.000Z');
  });

  it('a new day starts exactly at midnight in Kyiv', () => {
    const latest = row('2026-06-15', KYIV, '2026-06-15T08:00:00Z');
    const r = currentAllowanceDay(latest, KYIV, new Date('2026-06-15T21:00:00Z'));
    expect(r.isNew).toBe(true);
    expect(r.day.toISOString()).toBe('2026-06-16T00:00:00.000Z');
    expect(r.renewsAt.toISOString()).toBe('2026-06-16T21:00:00.000Z');
  });

  it('a zone change less than 24 h after the first message keeps the row; renewsAt is the 24 h mark', () => {
    const latest = row('2026-06-15', KYIV, '2026-06-15T20:00:00Z');
    // Auckland local date is already 16 June, but only 2 h have passed since the first message.
    const r = currentAllowanceDay(latest, AUCKLAND, new Date('2026-06-15T22:00:00Z'));
    expect(r.isNew).toBe(false);
    expect(r.day.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(r.renewsAt.toISOString()).toBe('2026-06-16T20:00:00.000Z');
  });

  it('a zone change 24 h or more after the first message opens the new local day', () => {
    const latest = row('2026-06-15', KYIV, '2026-06-15T20:00:00Z');
    const r = currentAllowanceDay(latest, AUCKLAND, new Date('2026-06-16T20:00:00Z'));
    expect(r.isNew).toBe(true);
    expect(r.day.toISOString()).toBe('2026-06-17T00:00:00.000Z');
  });

  it('one millisecond before the 24 h mark after a zone change the row is still current', () => {
    const latest = row('2026-06-15', KYIV, '2026-06-15T20:00:00Z');
    const r = currentAllowanceDay(latest, AUCKLAND, new Date('2026-06-16T19:59:59.999Z'));
    expect(r.isNew).toBe(false);
  });

  it('works in UTC (the fallback for a Freelancer with no saved zone)', () => {
    const r = currentAllowanceDay(null, 'UTC', new Date('2026-06-15T23:59:59Z'));
    expect(r.day.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(r.renewsAt.toISOString()).toBe('2026-06-16T00:00:00.000Z');
  });
});
