import 'server-only';
import { z } from 'zod';
import { Prisma, type Currency } from '@prisma/client';
import { prisma } from '@/prisma';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

// ADR-0004: one parameterized $queryRaw per section, always joined through "SenderProfile" on the
// owner. Sums are SUM(numeric) in SQL, cast to float8 once (exact two-decimal values), counts to int.
// Prisma stores DateTime as timestamp without time zone holding UTC, hence the double AT TIME ZONE.

const num = z.number();

const currencyRow = z.object({ currency: z.string() });

export async function queryCurrencyTabs(actor: ActingFreelancer) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT DISTINCT ba."currency"::text AS currency
    FROM "BankAccount" ba
    JOIN "SenderProfile" sp ON sp."id" = ba."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
    ORDER BY currency`;
  return z.array(currencyRow).parse(rows).map((r) => r.currency as Currency);
}

const statsRow = z.object({
  totalReceived: num,
  receivedCount: num,
  totalPlanned: num,
  plannedCount: num,
  totalOverdue: num,
  overdueCount: num,
  allFuturePayments: num,
  allFuturePaymentsCount: num,
});

/** `start` / `endExclusive` both null means all time. */
export async function querySummaryStats(
  actor: ActingFreelancer,
  currency: Currency,
  start: Date | null,
  endExclusive: Date | null,
) {
  const paidIn = Prisma.sql`(${start}::timestamp IS NULL OR (i."issueDate" >= ${start}::timestamp AND i."issueDate" < ${endExclusive}::timestamp))`;
  const dueIn = Prisma.sql`(${start}::timestamp IS NULL OR (i."dueDate" >= ${start}::timestamp AND i."dueDate" < ${endExclusive}::timestamp))`;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT
      COALESCE(SUM(i."total") FILTER (WHERE i."status" = 'PAID' AND ${paidIn}), 0)::float8 AS "totalReceived",
      (COUNT(*) FILTER (WHERE i."status" = 'PAID' AND ${paidIn}))::int AS "receivedCount",
      COALESCE(SUM(i."total") FILTER (WHERE i."status" = 'PENDING' AND ${dueIn}), 0)::float8 AS "totalPlanned",
      (COUNT(*) FILTER (WHERE i."status" = 'PENDING' AND ${dueIn}))::int AS "plannedCount",
      COALESCE(SUM(i."total") FILTER (WHERE i."status" = 'OVERDUE' AND ${dueIn}), 0)::float8 AS "totalOverdue",
      (COUNT(*) FILTER (WHERE i."status" = 'OVERDUE' AND ${dueIn}))::int AS "overdueCount",
      COALESCE(SUM(i."total") FILTER (WHERE i."status" IN ('PENDING', 'OVERDUE')), 0)::float8 AS "allFuturePayments",
      (COUNT(*) FILTER (WHERE i."status" IN ('PENDING', 'OVERDUE')))::int AS "allFuturePaymentsCount"
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND i."currency" = ${currency}::"Currency"
      AND i."status" <> 'DRAFT'`;
  return statsRow.parse(rows[0]);
}

const chartRow = z.object({ bucket: num, paid: num, planned: num });

export type ChartBucketing = {
  mode: 'day' | 'week' | 'month';
  /** First local day of the range, YYYY-MM-DD. */
  fromKey: string;
  /** year * 12 + (month - 1) of `fromKey`. */
  fromMonthIndex: number;
};

/** Paid (by issue day) and planned (by due day) sums per display bucket, in the actor's zone. */
export async function queryChartBuckets(
  actor: ActingFreelancer,
  currency: Currency,
  start: Date,
  endExclusive: Date,
  bucketing: ChartBucketing,
) {
  const step = bucketing.mode === 'week' ? 7 : 1;
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH local AS (
      SELECT
        i."total" AS total,
        i."status" = 'PAID' AS is_paid,
        (((CASE WHEN i."status" = 'PAID' THEN i."issueDate" ELSE i."dueDate" END) AT TIME ZONE 'UTC') AT TIME ZONE ${actor.timeZone})::date AS day
      FROM "Invoice" i
      JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
      WHERE sp."userId" = ${actor.userId}
        AND i."currency" = ${currency}::"Currency"
        AND (
          (i."status" = 'PAID' AND i."issueDate" >= ${start}::timestamp AND i."issueDate" < ${endExclusive}::timestamp)
          OR (i."status" IN ('PENDING', 'OVERDUE') AND i."dueDate" >= ${start}::timestamp AND i."dueDate" < ${endExclusive}::timestamp)
        )
    )
    SELECT
      (CASE WHEN ${bucketing.mode}::text = 'month'
        THEN (EXTRACT(YEAR FROM day)::int * 12 + EXTRACT(MONTH FROM day)::int - 1) - ${bucketing.fromMonthIndex}::int
        ELSE (day - ${bucketing.fromKey}::date) / ${step}::int
      END)::int AS bucket,
      COALESCE(SUM(total) FILTER (WHERE is_paid), 0)::float8 AS paid,
      COALESCE(SUM(total) FILTER (WHERE NOT is_paid), 0)::float8 AS planned
    FROM local
    GROUP BY 1
    ORDER BY 1`;
  return z.array(chartRow).parse(rows);
}
