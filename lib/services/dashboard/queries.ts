import 'server-only';
import { z } from 'zod';
import { Prisma, type Currency } from '@prisma/client';
import { prisma } from '@/prisma';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { overdueSql, type LocalDate } from '@/lib/services/_shared/overdue';

// ADR-0004: one parameterized $queryRaw per section, always joined through "SenderProfile" on the
// owner. Sums are SUM(numeric) in SQL, cast to float8 once (exact two-decimal values), counts to int.
// T25: issueDate and dueDate are calendar days stored at T00:00:00Z. A period is a pair of UTC-midnight
// bounds (`[from, day after to)`, see periodBounds), so `col >= start AND col < endExclusive` compares by
// calendar day, in no zone; the chart reads a row's day with `::date`.

const num = z.number();

// ADR-0005: the only way a query says "overdue" or "unpaid". `today` is a calendar date in the
// actor's zone (bound, never now()). Unpaid = pending, or overdue by the shared rule.
const pendingNotOverdue = (today: LocalDate) => Prisma.sql`(i."status" = 'PENDING' AND NOT ${overdueSql(today)})`;
const unpaid = (today: LocalDate) => Prisma.sql`(i."status" = 'PENDING' OR ${overdueSql(today)})`;

const currencyRow = z.object({ currency: z.string() });

// Tabs keep the order each currency was first added in: the dashboard opens the first tab when the
// link names no currency.
export async function queryCurrencyTabs(actor: ActingFreelancer) {
  // ADR-0008: bank-account currencies first (creation order), then currencies only issued invoices use.
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT t.currency
    FROM (
      SELECT ba."currency"::text AS currency, 0 AS src, MIN(ba."createdAt") AS first_at, MIN(ba."id") AS first_id
      FROM "BankAccount" ba
      JOIN "SenderProfile" sp ON sp."id" = ba."senderProfileId"
      WHERE sp."userId" = ${actor.userId}
      GROUP BY ba."currency"
      UNION ALL
      SELECT i."currency"::text AS currency, 1 AS src, MIN(i."createdAt") AS first_at, MIN(i."id") AS first_id
      FROM "Invoice" i
      JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
      WHERE sp."userId" = ${actor.userId} AND i."status" <> 'DRAFT'
      GROUP BY i."currency"
    ) t
    GROUP BY t.currency
    ORDER BY MIN(t.src), MIN(t.first_at), MIN(t.first_id)`;
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
  today: LocalDate,
) {
  const paidIn = Prisma.sql`(${start}::timestamp IS NULL OR (i."issueDate" >= ${start}::timestamp AND i."issueDate" < ${endExclusive}::timestamp))`;
  const dueIn = Prisma.sql`(${start}::timestamp IS NULL OR (i."dueDate" >= ${start}::timestamp AND i."dueDate" < ${endExclusive}::timestamp))`;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT
      COALESCE(SUM(i."total") FILTER (WHERE i."status" = 'PAID' AND ${paidIn}), 0)::float8 AS "totalReceived",
      (COUNT(*) FILTER (WHERE i."status" = 'PAID' AND ${paidIn}))::int AS "receivedCount",
      COALESCE(SUM(i."total") FILTER (WHERE ${pendingNotOverdue(today)} AND ${dueIn}), 0)::float8 AS "totalPlanned",
      (COUNT(*) FILTER (WHERE ${pendingNotOverdue(today)} AND ${dueIn}))::int AS "plannedCount",
      COALESCE(SUM(i."total") FILTER (WHERE ${overdueSql(today)} AND ${dueIn}), 0)::float8 AS "totalOverdue",
      (COUNT(*) FILTER (WHERE ${overdueSql(today)} AND ${dueIn}))::int AS "overdueCount",
      COALESCE(SUM(i."total") FILTER (WHERE ${unpaid(today)}), 0)::float8 AS "allFuturePayments",
      (COUNT(*) FILTER (WHERE ${unpaid(today)}))::int AS "allFuturePaymentsCount"
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

/** Paid (by issue day) and planned (by due day) sums per display bucket; the days are calendar days, not zone-shifted. */
export async function queryChartBuckets(
  actor: ActingFreelancer,
  currency: Currency,
  start: Date,
  endExclusive: Date,
  bucketing: ChartBucketing,
  today: LocalDate,
) {
  const step = bucketing.mode === 'week' ? 7 : 1;
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH local AS (
      SELECT
        i."total" AS total,
        i."status" = 'PAID' AS is_paid,
        (CASE WHEN i."status" = 'PAID' THEN i."issueDate" ELSE i."dueDate" END)::date AS day
      FROM "Invoice" i
      JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
      WHERE sp."userId" = ${actor.userId}
        AND i."currency" = ${currency}::"Currency"
        AND (
          (i."status" = 'PAID' AND i."issueDate" >= ${start}::timestamp AND i."issueDate" < ${endExclusive}::timestamp)
          OR (${unpaid(today)} AND i."dueDate" >= ${start}::timestamp AND i."dueDate" < ${endExclusive}::timestamp)
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

const accountRow = z.object({
  senderProfileId: z.string(),
  senderName: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  bankName: z.string(),
  received: num,
  planned: num,
  allFuturePlanned: num,
});

/**
 * One row per (sender profile, bank account) with invoices in scope, in display order: profile name,
 * bank name, holder name. Names come from the most recent invoice of the group (issue date, then created).
 * `start` / `endExclusive` both null means all time; "all future planned" never depends on the period.
 */
export async function querySenderAccounts(
  actor: ActingFreelancer,
  currency: Currency,
  start: Date | null,
  endExclusive: Date | null,
  today: LocalDate,
) {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH scoped AS (
      SELECT i."id", i."senderProfileId", i."bankAccountId", i."senderName", i."bankName", i."accountName",
        i."status", i."total", i."issueDate", i."createdAt", ${unpaid(today)} AS "unpaid"
      FROM "Invoice" i
      JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
      WHERE sp."userId" = ${actor.userId}
        AND i."currency" = ${currency}::"Currency"
        AND (${start}::timestamp IS NULL OR (
          (i."status" = 'PAID' AND i."issueDate" >= ${start}::timestamp AND i."issueDate" < ${endExclusive}::timestamp)
          OR (${unpaid(today)} AND i."dueDate" >= ${start}::timestamp AND i."dueDate" < ${endExclusive}::timestamp)
        ))
    ),
    sender_name AS (
      SELECT DISTINCT ON ("senderProfileId") "senderProfileId", "senderName"
      FROM scoped
      ORDER BY "senderProfileId", "issueDate" DESC, "createdAt" DESC, "id" DESC
    ),
    account_name AS (
      SELECT DISTINCT ON ("senderProfileId", "bankAccountId") "senderProfileId", "bankAccountId", "bankName", "accountName"
      FROM scoped
      ORDER BY "senderProfileId", "bankAccountId", "issueDate" DESC, "createdAt" DESC, "id" DESC
    ),
    sums AS (
      SELECT "senderProfileId", "bankAccountId",
        COALESCE(SUM("total") FILTER (WHERE "status" = 'PAID'), 0) AS received,
        COALESCE(SUM("total") FILTER (WHERE "unpaid"), 0) AS planned
      FROM scoped
      GROUP BY "senderProfileId", "bankAccountId"
    ),
    future AS (
      SELECT i."senderProfileId", SUM(i."total") AS total
      FROM "Invoice" i
      JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
      WHERE sp."userId" = ${actor.userId}
        AND i."currency" = ${currency}::"Currency"
        AND ${unpaid(today)}
      GROUP BY i."senderProfileId"
    )
    SELECT
      s."senderProfileId" AS "senderProfileId",
      sn."senderName" AS "senderName",
      s."bankAccountId" AS "accountId",
      an."accountName" AS "accountName",
      an."bankName" AS "bankName",
      s.received::float8 AS received,
      s.planned::float8 AS planned,
      COALESCE(f.total, 0)::float8 AS "allFuturePlanned"
    FROM sums s
    JOIN sender_name sn ON sn."senderProfileId" = s."senderProfileId"
    JOIN account_name an ON an."senderProfileId" = s."senderProfileId" AND an."bankAccountId" = s."bankAccountId"
    LEFT JOIN future f ON f."senderProfileId" = s."senderProfileId"
    ORDER BY sn."senderName", s."senderProfileId", an."bankName", an."accountName", s."bankAccountId"`;
  return z.array(accountRow).parse(rows);
}

const recentRow = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  customerName: z.string(),
  status: z.string(),
  issueDate: z.date(),
  dueDate: z.date(),
  total: num,
  currency: z.string(),
});

/** The 10 most recently created invoices in the currency, newest first. */
export async function queryRecentInvoices(actor: ActingFreelancer, currency: Currency) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT i."id", i."invoiceNumber", i."customerName", i."status"::text AS status, i."issueDate", i."dueDate",
      i."total"::float8 AS total, i."currency"::text AS currency
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND i."currency" = ${currency}::"Currency"
    ORDER BY i."createdAt" DESC, i."id" DESC
    LIMIT 10`;
  return z.array(recentRow).parse(rows);
}

const debtorRow = z.object({ customerId: z.string(), customerName: z.string(), total: num, count: num });

/** Top three overdue Customers by exact total, ties by name; the name is from the latest overdue invoice. */
export async function queryDebtors(actor: ActingFreelancer, currency: Currency, today: LocalDate) {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH overdue AS (
      SELECT i."id", i."customerId", i."customerName", i."total", i."issueDate", i."createdAt"
      FROM "Invoice" i
      JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
      WHERE sp."userId" = ${actor.userId}
        AND ${overdueSql(today)}
        AND i."currency" = ${currency}::"Currency"
    ),
    latest AS (
      SELECT DISTINCT ON ("customerId") "customerId", "customerName"
      FROM overdue
      ORDER BY "customerId", "issueDate" DESC, "createdAt" DESC, "id" DESC
    ),
    sums AS (
      SELECT "customerId", SUM("total") AS total, COUNT(*) AS count
      FROM overdue
      GROUP BY "customerId"
    )
    SELECT s."customerId" AS "customerId", l."customerName" AS "customerName", s.total::float8 AS total, s.count::int AS count
    FROM sums s
    JOIN latest l ON l."customerId" = s."customerId"
    ORDER BY s.total DESC, l."customerName" ASC, s."customerId" ASC
    LIMIT 3`;
  return z.array(debtorRow).parse(rows);
}

const expectedRow = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  customerName: z.string(),
  total: num,
  dueDate: z.date(),
  groupTotal: num,
  groupCount: num,
});

/** The three earliest-due pending invoices, each row carrying the exact total and count of all pending. */
export async function queryExpectedPayments(actor: ActingFreelancer, currency: Currency, today: LocalDate) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT i."id", i."invoiceNumber", i."customerName", i."total"::float8 AS total, i."dueDate",
      (SUM(i."total") OVER ())::float8 AS "groupTotal",
      (COUNT(*) OVER ())::int AS "groupCount"
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND ${pendingNotOverdue(today)}
      AND i."currency" = ${currency}::"Currency"
    ORDER BY i."dueDate" ASC, i."createdAt" ASC, i."id" ASC
    LIMIT 3`;
  return z.array(expectedRow).parse(rows);
}

// ───────── T14: strict-paged Assistant reads (overdue invoices, Debtors) ─────────

const currencyFilter = (currency: Currency | undefined) =>
  currency ? Prisma.sql`AND i."currency" = ${currency}::"Currency"` : Prisma.empty;

// Exact two-decimal text straight from SQL numeric: no float round trip (ADR-0006).
const overdueTotalsRow = z.object({ currency: z.string(), total: z.string(), count: num });

/** Exact total and count of every overdue invoice, per currency. */
export async function queryOverdueTotals(actor: ActingFreelancer, today: LocalDate, currency?: Currency) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT i."currency"::text AS currency, SUM(i."total")::numeric(20,2)::text AS total, COUNT(*)::int AS count
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND ${overdueSql(today)}
      ${currencyFilter(currency)}
    GROUP BY i."currency"
    ORDER BY i."currency"::text`;
  return z.array(overdueTotalsRow).parse(rows);
}

const overdueListRow = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  senderProfileId: z.string(),
  senderName: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  amount: z.string(),
  currency: z.string(),
  dueDate: z.date(),
});

/** One page of overdue invoices, due date ascending, then invoice number, then id. */
export async function queryOverdueInvoicePage(
  actor: ActingFreelancer,
  today: LocalDate,
  offset: number,
  limit: number,
  currency?: Currency,
) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT i."id", i."invoiceNumber", sp."id" AS "senderProfileId", sp."name" AS "senderName",
      i."customerId", i."customerName", i."total"::numeric(20,2)::text AS amount,
      i."currency"::text AS currency, i."dueDate"
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND ${overdueSql(today)}
      ${currencyFilter(currency)}
    ORDER BY i."dueDate" ASC, i."invoiceNumber" ASC, i."id" ASC
    OFFSET ${offset} LIMIT ${limit}`;
  return z.array(overdueListRow).parse(rows);
}

const debtorTotalsRow = z.object({
  currency: z.string(),
  debtorCount: num,
  overdueTotal: z.string(),
  overdueCount: num,
});

/** Per currency: Debtor count and exact overdue total and count over every Debtor. */
export async function queryDebtorTotals(actor: ActingFreelancer, today: LocalDate, currency?: Currency) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT i."currency"::text AS currency,
      COUNT(DISTINCT i."customerId")::int AS "debtorCount",
      SUM(i."total")::numeric(20,2)::text AS "overdueTotal",
      COUNT(*)::int AS "overdueCount"
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND ${overdueSql(today)}
      ${currencyFilter(currency)}
    GROUP BY i."currency"
    ORDER BY i."currency"::text`;
  return z.array(debtorTotalsRow).parse(rows);
}

const debtorPageRow = z.object({
  customerId: z.string(),
  customerName: z.string(),
  currency: z.string(),
  rank: num,
  overdueTotal: z.string(),
  overdueCount: num,
});

/**
 * One page of Debtors: one row per Customer per currency, ranked by exact overdue total within the
 * currency (ties by name, then id; the name is from the latest overdue invoice, as queryDebtors).
 */
export async function queryDebtorPage(
  actor: ActingFreelancer,
  today: LocalDate,
  offset: number,
  limit: number,
  currency?: Currency,
) {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH overdue AS (
      SELECT i."id", i."customerId", i."customerName", i."currency", i."total", i."issueDate", i."createdAt"
      FROM "Invoice" i
      JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
      WHERE sp."userId" = ${actor.userId}
        AND ${overdueSql(today)}
        ${currencyFilter(currency)}
    ),
    latest AS (
      SELECT DISTINCT ON ("customerId", "currency") "customerId", "currency", "customerName"
      FROM overdue
      ORDER BY "customerId", "currency", "issueDate" DESC, "createdAt" DESC, "id" DESC
    ),
    sums AS (
      SELECT "customerId", "currency", SUM("total") AS total, COUNT(*) AS count
      FROM overdue
      GROUP BY "customerId", "currency"
    ),
    ranked AS (
      SELECT s."customerId", l."customerName", s."currency", s.total, s.count,
        ROW_NUMBER() OVER (PARTITION BY s."currency" ORDER BY s.total DESC, l."customerName" ASC, s."customerId" ASC) AS rank
      FROM sums s
      JOIN latest l ON l."customerId" = s."customerId" AND l."currency" = s."currency"
    )
    SELECT "customerId", "customerName", "currency"::text AS currency, rank::int AS rank,
      total::numeric(20,2)::text AS "overdueTotal", count::int AS "overdueCount"
    FROM ranked
    ORDER BY "currency"::text ASC, rank ASC
    OFFSET ${offset} LIMIT ${limit}`;
  return z.array(debtorPageRow).parse(rows);
}

// ───────── T15: Expected payments by period and the summary currencies ─────────

// Pending, not overdue by the shared rule, due within the period when one is given (the dashboard's
// "planned" condition), optionally one currency.
const expectedScope = (today: LocalDate, start: Date | null, endExclusive: Date | null, currency?: Currency) => Prisma.sql`
  ${pendingNotOverdue(today)}
  AND (${start}::timestamp IS NULL OR (i."dueDate" >= ${start}::timestamp AND i."dueDate" < ${endExclusive}::timestamp))
  ${currencyFilter(currency)}`;

/** Exact total and count of every Expected payment in scope, per currency. */
export async function queryExpectedTotals(
  actor: ActingFreelancer,
  today: LocalDate,
  start: Date | null,
  endExclusive: Date | null,
  currency?: Currency,
) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT i."currency"::text AS currency, SUM(i."total")::numeric(20,2)::text AS total, COUNT(*)::int AS count
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND ${expectedScope(today, start, endExclusive, currency)}
    GROUP BY i."currency"
    ORDER BY i."currency"::text`;
  return z.array(overdueTotalsRow).parse(rows);
}

const expectedListRow = overdueListRow;

/** One page of Expected payments: currency, due date, invoice number, then id. */
export async function queryExpectedPaymentsPage(
  actor: ActingFreelancer,
  today: LocalDate,
  start: Date | null,
  endExclusive: Date | null,
  offset: number,
  limit: number,
  currency?: Currency,
) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT i."id", i."invoiceNumber", sp."id" AS "senderProfileId", sp."name" AS "senderName",
      i."customerId", i."customerName", i."total"::numeric(20,2)::text AS amount,
      i."currency"::text AS currency, i."dueDate"
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId}
      AND ${expectedScope(today, start, endExclusive, currency)}
    ORDER BY i."currency"::text ASC, i."dueDate" ASC, i."invoiceNumber" ASC, i."id" ASC
    OFFSET ${offset} LIMIT ${limit}`;
  return z.array(expectedListRow).parse(rows);
}

/** Every currency on the Freelancer's issued (non-draft) invoices, by code (ADR-0008 union, invoice side). */
export async function queryIssuedInvoiceCurrencies(actor: ActingFreelancer) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT DISTINCT i."currency"::text AS currency
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    WHERE sp."userId" = ${actor.userId} AND i."status" <> 'DRAFT'
    ORDER BY 1`;
  return z.array(currencyRow).parse(rows).map((r) => r.currency as Currency);
}
