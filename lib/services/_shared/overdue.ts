// T02 (spec.md §1 overdue rule, §5 AC-12/AC-23/AC-23b; ADR-0005) — the one overdue rule, in three
// equivalent forms (SQL fragment, Prisma condition, TypeScript predicate). Overdue is derived at
// read time: an issued, unpaid invoice is overdue when it was marked overdue or its due date is
// before today in the Freelancer time zone. Stored statuses never change.
//
// A due date is a calendar day (the date the Freelancer entered, stored at UTC midnight, T25) compared
// with `today`, a calendar date in the Freelancer time zone, without any shift. `today` is always
// passed in (a bound parameter), never `now()`, so the zone edge cases are testable with a fake
// clock. Any hand-written OVERDUE status check outside this module bypasses the rule; the scan
// test in tests/unit/services/overdue-literal-scan.test.ts fails on one.
import 'server-only';
import { Prisma, type InvoiceStatus } from '@prisma/client';
import { formatLocalDateKey } from '@/lib/services/_shared/time-zone';
import { dayToUtcDate, utcDateToDay } from '@/lib/helpers/calendar-day';

/** A calendar date, `yyyy-MM-dd`. */
export type LocalDate = string;

export type DerivedInvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';

type OverdueRow = { status: InvoiceStatus; dueDate: Date };

const MS_PER_DAY = 86_400_000;

/** Today's calendar date in `timeZone` (DST-safe: the zone's own calendar date, no hour arithmetic). */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return formatLocalDateKey(now, timeZone);
}

function dueDay(dueDate: Date): LocalDate {
  return utcDateToDay(dueDate);
}

function dayNumber(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/**
 * SQL form. `alias` is the Invoice table alias in the surrounding query (a plain identifier).
 * Prisma stores DateTime as timestamp; `::date` takes its calendar day.
 */
export function overdueSql(today: LocalDate, alias: string = 'i'): Prisma.Sql {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Invalid SQL alias');
  const a = Prisma.raw(`"${alias}"`);
  return Prisma.sql`(${a}."status" = 'OVERDUE' OR (${a}."status" = 'PENDING' AND ${a}."dueDate"::date < ${today}::date))`;
}

/** Prisma `where` form. */
export function overdueWhere(today: LocalDate): Prisma.InvoiceWhereInput {
  return {
    OR: [
      { status: 'OVERDUE' },
      { status: 'PENDING', dueDate: { lt: dayToUtcDate(today) } },
    ],
  };
}

/** Single-row TypeScript form. */
export function isOverdue(row: OverdueRow, today: LocalDate): boolean {
  if (row.status === 'OVERDUE') return true;
  return row.status === 'PENDING' && dueDay(row.dueDate) < today;
}

/** Whole days from the due date to `today`, never below 0. */
export function daysOverdue(dueDate: Date, today: LocalDate): number {
  return Math.max(0, dayNumber(today) - dayNumber(dueDay(dueDate)));
}

/** The status surfaces show: `overdue` per the rule, otherwise the stored status. */
export function derivedStatus(row: OverdueRow, today: LocalDate): DerivedInvoiceStatus {
  if (isOverdue(row, today)) return 'overdue';
  return row.status.toLowerCase() as DerivedInvoiceStatus;
}

/** The stored-enum status a DTO returns: the overdue value per the rule, otherwise the stored one. */
export function derivedInvoiceStatus(row: OverdueRow, today: LocalDate): InvoiceStatus {
  return isOverdue(row, today) ? 'OVERDUE' : row.status;
}

/** Maps a row to itself with its `status` replaced by the derived one (reads never write it). */
export function withDerivedStatus<T extends OverdueRow>(row: T, today: LocalDate): T {
  return { ...row, status: derivedInvoiceStatus(row, today) };
}

/**
 * `where` for an invoice list status filter (AC-24): the overdue filter uses the rule and the
 * pending filter leaves out what the rule calls overdue; any other status filters on the stored one.
 */
export function statusFilterWhere(status: InvoiceStatus, today: LocalDate): Prisma.InvoiceWhereInput {
  if (status === 'OVERDUE') return overdueWhere(today);
  if (status === 'PENDING') return { status: 'PENDING', NOT: overdueWhere(today) };
  return { status };
}

/**
 * True when a manual change to `target` must be refused: the invoice is overdue only because its
 * due date has passed, and `target` is the overdue or pending status (marking it paid still works).
 */
export function refusesManualStatus(row: OverdueRow, target: InvoiceStatus, today: LocalDate): boolean {
  return (
    row.status === 'PENDING' &&
    isOverdue(row, today) &&
    (target === 'OVERDUE' || target === 'PENDING')
  );
}
