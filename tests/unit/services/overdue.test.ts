// T02 (spec.md §5 AC-12, AC-23, AC-23b; ADR-0005) — the shared overdue rule's TypeScript form and
// "today in the Freelancer time zone", under a fake clock.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  daysOverdue,
  derivedStatus,
  isOverdue,
  overdueSql,
  overdueWhere,
  todayIn,
} from '@/lib/services/_shared/overdue';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

afterEach(() => vi.useRealTimers());

describe('todayIn (AC-23, AC-23b)', () => {
  it('AC-23: 00:30 on 1 Oct in Kyiv is still 30 Sep in UTC, but today is 1 Oct in Kyiv', () => {
    const now = new Date('2026-09-30T21:30:00Z'); // Kyiv is UTC+3 in September
    expect(now.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(todayIn('Europe/Kyiv', now)).toBe('2026-10-01');
    expect(todayIn('UTC', now)).toBe('2026-09-30');
  });

  it('AC-23b: 21:00 on 14 Mar in New York is 15 Mar in UTC; today is still 14 Mar', () => {
    const now = new Date('2026-03-15T01:00:00Z'); // New York is UTC-4 (DST began 8 Mar)
    expect(todayIn('America/New_York', now)).toBe('2026-03-14');
  });

  it('AC-23b: from 00:00 on 15 Mar in New York today is 15 Mar', () => {
    expect(todayIn('America/New_York', new Date('2026-03-15T04:00:00Z'))).toBe('2026-03-15');
    expect(todayIn('America/New_York', new Date('2026-03-15T03:59:59Z'))).toBe('2026-03-14');
  });

  it('defaults to the application clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T21:30:00Z'));
    expect(todayIn('Europe/Kyiv')).toBe('2026-10-01');
  });

  it('uses the calendar date on a DST transition day', () => {
    // Kyiv springs forward 2026-03-29 03:00 -> 04:00
    expect(todayIn('Europe/Kyiv', new Date('2026-03-28T22:00:00Z'))).toBe('2026-03-29');
    expect(todayIn('Europe/Kyiv', new Date('2026-03-29T20:59:00Z'))).toBe('2026-03-29');
    expect(todayIn('Europe/Kyiv', new Date('2026-03-29T21:00:00Z'))).toBe('2026-03-30');
  });
});

describe('isOverdue / derivedStatus / daysOverdue (AC-12)', () => {
  const today = '2026-10-04';
  const yesterdayPending = { status: 'PENDING' as const, dueDate: day('2026-10-03') };
  const handMarked = { status: 'OVERDUE' as const, dueDate: day('2026-10-10') };
  const tomorrowPending = { status: 'PENDING' as const, dueDate: day('2026-10-05') };

  it('selects the first two AC-12 invoices and not the third', () => {
    expect(isOverdue(yesterdayPending, today)).toBe(true);
    expect(isOverdue(handMarked, today)).toBe(true);
    expect(isOverdue(tomorrowPending, today)).toBe(false);
  });

  it('days overdue: 1 for due yesterday, 0 for hand-marked before its due date', () => {
    expect(daysOverdue(yesterdayPending.dueDate, today)).toBe(1);
    expect(daysOverdue(handMarked.dueDate, today)).toBe(0);
    expect(daysOverdue(day('2026-09-04'), today)).toBe(30);
  });

  it('a due date equal to today is not overdue', () => {
    expect(isOverdue({ status: 'PENDING', dueDate: day('2026-10-04') }, today)).toBe(false);
  });

  it('a due date with a time of day is still the calendar day entered', () => {
    expect(isOverdue({ status: 'PENDING', dueDate: new Date('2026-10-04T23:30:00Z') }, today)).toBe(false);
    expect(isOverdue({ status: 'PENDING', dueDate: new Date('2026-10-03T23:30:00Z') }, today)).toBe(true);
  });

  it.each(['PAID', 'DRAFT', 'CANCELLED'] as const)('%s past due is never overdue', (status) => {
    expect(isOverdue({ status, dueDate: day('2026-01-01') }, today)).toBe(false);
  });

  it('derivedStatus reports overdue for pending past due and keeps stored status otherwise', () => {
    expect(derivedStatus(yesterdayPending, today)).toBe('overdue');
    expect(derivedStatus(handMarked, today)).toBe('overdue');
    expect(derivedStatus(tomorrowPending, today)).toBe('pending');
    expect(derivedStatus({ status: 'PAID', dueDate: day('2026-01-01') }, today)).toBe('paid');
    expect(derivedStatus({ status: 'DRAFT', dueDate: day('2026-01-01') }, today)).toBe('draft');
    expect(derivedStatus({ status: 'CANCELLED', dueDate: day('2026-01-01') }, today)).toBe('cancelled');
  });

  it('daysOverdue never goes below 0', () => {
    expect(daysOverdue(day('2027-01-01'), today)).toBe(0);
  });

  it('AC-23: pending due the last day of the previous month is overdue on the 1st in Kyiv', () => {
    const t = todayIn('Europe/Kyiv', new Date('2026-09-30T21:30:00Z'));
    const row = { status: 'PENDING' as const, dueDate: day('2026-09-30') };
    expect(isOverdue(row, t)).toBe(true);
    expect(daysOverdue(row.dueDate, t)).toBe(1);
    expect(isOverdue(row, todayIn('UTC', new Date('2026-09-30T21:30:00Z')))).toBe(false);
  });

  it('AC-23b: pending due 14 Mar is not overdue at 21:00 in New York, overdue by 1 day after midnight', () => {
    const row = { status: 'PENDING' as const, dueDate: day('2026-03-14') };
    const before = todayIn('America/New_York', new Date('2026-03-15T01:00:00Z'));
    const after = todayIn('America/New_York', new Date('2026-03-15T04:00:00Z'));
    expect(isOverdue(row, before)).toBe(false);
    expect(isOverdue(row, after)).toBe(true);
    expect(daysOverdue(row.dueDate, after)).toBe(1);
  });
});

describe('query forms bind today as a parameter', () => {
  it('overdueSql carries today as a bound value, never now()', () => {
    const frag = overdueSql('2026-10-04');
    expect(frag.values).toContain('2026-10-04');
    expect(frag.sql.toLowerCase()).not.toContain('now()');
    expect(frag.sql.toLowerCase()).not.toContain('current_date');
  });

  it('overdueWhere compares the due date with the start of today (UTC calendar day)', () => {
    const where = overdueWhere('2026-10-04');
    expect(JSON.stringify(where)).toContain('2026-10-04T00:00:00.000Z');
  });
});
