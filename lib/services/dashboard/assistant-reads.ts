import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { Currency as CurrencyEnum, type Currency } from '@prisma/client';
import { ok, type ActionResult, type DecimalString } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { daysOverdue, todayIn, type LocalDate } from '@/lib/services/_shared/overdue';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import { utcDateToDay } from '@/lib/helpers/calendar-day';
import {
  isPageOutOfRange,
  pageOutOfRange,
  strictPage,
  strictPageInfo,
  type StrictPageInfo,
} from '@/lib/services/_shared/strict-page';
import {
  queryDebtorPage,
  queryDebtorTotals,
  queryExpectedPaymentsPage,
  queryExpectedTotals,
  queryIssuedInvoiceCurrencies,
  queryOverdueInvoicePage,
  queryOverdueTotals,
  querySummaryStats,
} from './queries';
import {
  periodBounds,
  resolveAssistantPeriod,
  type AppliedPeriod,
  type AssistantPeriodInput,
  type DashboardPeriod,
} from './period';

// T14 (AC-12, AC-13, AC-18, AC-18b; ADR-0002): the Assistant reads of the overdue figures. Same
// overdue rule and "today" as the dashboard; totals cover every match, never only the page.

const MAX_INT = 2 ** 31 - 1;
const assistantListInput = z.object({
  page: z.number().int().min(1).max(MAX_INT).optional(),
  pageSize: z.number().int().min(1).max(MAX_INT).optional(),
  currency: z.nativeEnum(CurrencyEnum).optional(),
});

export type AssistantListInput = z.input<typeof assistantListInput>;

export type CurrencyTotal = { currency: Currency; total: DecimalString; count: number };

export type OverdueInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  senderProfile: { senderProfileId: string; name: string };
  customer: { customerId: string; name: string };
  status: 'overdue';
  amount: DecimalString;
  currency: Currency;
  dueDate: LocalDate;
  daysOverdue: number;
};

export type OverdueInvoicesPage = {
  today: LocalDate;
  timeZone: string;
  rows: OverdueInvoiceRow[];
  totals: CurrencyTotal[];
  pageInfo: StrictPageInfo;
};

export type DebtorRow = {
  customer: { customerId: string; name: string };
  currency: Currency;
  rank: number;
  overdueTotal: DecimalString;
  overdueCount: number;
};

export type DebtorCurrencyTotal = {
  currency: Currency;
  debtorCount: number;
  overdueTotal: DecimalString;
  overdueCount: number;
};

export type DebtorsPage = {
  today: LocalDate;
  timeZone: string;
  rows: DebtorRow[];
  totals: DebtorCurrencyTotal[];
  pageInfo: StrictPageInfo;
};

export async function listOverdueInvoices(
  actor: ActingFreelancer,
  input: AssistantListInput = {},
): Promise<ActionResult<OverdueInvoicesPage>> {
  return Sentry.startSpan({ name: 'dashboard.assistant-overdue-invoices', op: 'function' }, async () => {
    const parsed = assistantListInput.safeParse(input ?? {});
    if (!parsed.success) return zodValidationFailure(parsed.error, 'Invalid list request.');
    const { currency } = parsed.data;
    try {
      const today = todayIn(actor.timeZone);
      const plan = strictPage(parsed.data);
      const totals = await queryOverdueTotals(actor, today, currency);
      const total = totals.reduce((n, t) => n + t.count, 0);
      if (isPageOutOfRange(plan.page, total, plan.pageSize)) return pageOutOfRange(total, plan.pageSize);
      const rows = total === 0 ? [] : await queryOverdueInvoicePage(actor, today, plan.offset, plan.limit, currency);
      return ok({
        today,
        timeZone: actor.timeZone,
        rows: rows.map(
          (r): OverdueInvoiceRow => ({
            invoiceId: r.id,
            invoiceNumber: r.invoiceNumber,
            senderProfile: { senderProfileId: r.senderProfileId, name: r.senderName },
            customer: { customerId: r.customerId, name: r.customerName },
            status: 'overdue',
            amount: r.amount,
            currency: r.currency as Currency,
            dueDate: utcDateToDay(r.dueDate),
            daysOverdue: daysOverdue(r.dueDate, today),
          }),
        ),
        totals: totals.map((t) => ({ currency: t.currency as Currency, total: t.total, count: t.count })),
        pageInfo: strictPageInfo(plan, total),
      });
    } catch (error) {
      return failed('Error listing overdue invoices:', error, 'Failed to fetch overdue invoices.');
    }
  });
}

export async function listDebtorsPage(
  actor: ActingFreelancer,
  input: AssistantListInput = {},
): Promise<ActionResult<DebtorsPage>> {
  return Sentry.startSpan({ name: 'dashboard.assistant-debtors', op: 'function' }, async () => {
    const parsed = assistantListInput.safeParse(input ?? {});
    if (!parsed.success) return zodValidationFailure(parsed.error, 'Invalid list request.');
    const { currency } = parsed.data;
    try {
      const today = todayIn(actor.timeZone);
      const plan = strictPage(parsed.data);
      const totals = await queryDebtorTotals(actor, today, currency);
      const total = totals.reduce((n, t) => n + t.debtorCount, 0);
      if (isPageOutOfRange(plan.page, total, plan.pageSize)) return pageOutOfRange(total, plan.pageSize);
      const rows = total === 0 ? [] : await queryDebtorPage(actor, today, plan.offset, plan.limit, currency);
      return ok({
        today,
        timeZone: actor.timeZone,
        rows: rows.map(
          (r): DebtorRow => ({
            customer: { customerId: r.customerId, name: r.customerName },
            currency: r.currency as Currency,
            rank: r.rank,
            overdueTotal: r.overdueTotal,
            overdueCount: r.overdueCount,
          }),
        ),
        totals: totals.map((t) => ({ ...t, currency: t.currency as Currency })),
        pageInfo: strictPageInfo(plan, total),
      });
    } catch (error) {
      return failed('Error listing debtors:', error, 'Failed to fetch debtors.');
    }
  });
}

// T15 (AC-14, AC-15, AC-16): Expected payments by period and the summary figures. Both are built on
// the dashboard's own SQL, so every figure equals the dashboard's to the cent.

const expectedPaymentsInput = assistantListInput.extend({ period: z.unknown().optional() });

export type ExpectedPaymentsInput = Omit<z.input<typeof expectedPaymentsInput>, 'period'> & {
  period?: AssistantPeriodInput;
};

export type ExpectedPaymentRow = Omit<OverdueInvoiceRow, 'status' | 'daysOverdue'> & {
  status: 'pending';
  daysOverdue: null;
};

export type ExpectedPaymentsPage = {
  today: LocalDate;
  timeZone: string;
  period: AppliedPeriod;
  rows: ExpectedPaymentRow[];
  totals: CurrencyTotal[];
  pageInfo: StrictPageInfo;
};

/** `period` absent: every pending, not-overdue invoice (the dashboard's Expected payments). */
export async function listExpectedPaymentsPage(
  actor: ActingFreelancer,
  input: ExpectedPaymentsInput = {},
): Promise<ActionResult<ExpectedPaymentsPage>> {
  return Sentry.startSpan({ name: 'dashboard.assistant-expected-payments', op: 'function' }, async () => {
    const parsed = expectedPaymentsInput.safeParse(input ?? {});
    if (!parsed.success) return zodValidationFailure(parsed.error, 'Invalid list request.');
    const { currency } = parsed.data;
    const today = todayIn(actor.timeZone);
    const resolved = resolveAssistantPeriod(parsed.data.period, today);
    if ('success' in resolved) return resolved;
    try {
      const [start, endExclusive] = resolved.range ? periodBounds(resolved.range) : [null, null];
      const plan = strictPage(parsed.data);
      const totals = await queryExpectedTotals(actor, today, start, endExclusive, currency);
      const total = totals.reduce((n, t) => n + t.count, 0);
      if (isPageOutOfRange(plan.page, total, plan.pageSize)) return pageOutOfRange(total, plan.pageSize);
      const rows =
        total === 0
          ? []
          : await queryExpectedPaymentsPage(actor, today, start, endExclusive, plan.offset, plan.limit, currency);
      return ok({
        today,
        timeZone: actor.timeZone,
        period: resolved.applied,
        rows: rows.map(
          (r): ExpectedPaymentRow => ({
            invoiceId: r.id,
            invoiceNumber: r.invoiceNumber,
            senderProfile: { senderProfileId: r.senderProfileId, name: r.senderName },
            customer: { customerId: r.customerId, name: r.customerName },
            status: 'pending',
            amount: r.amount,
            currency: r.currency as Currency,
            dueDate: utcDateToDay(r.dueDate),
            daysOverdue: null,
          }),
        ),
        totals: totals.map((t) => ({ currency: t.currency as Currency, total: t.total, count: t.count })),
        pageInfo: strictPageInfo(plan, total),
      });
    } catch (error) {
      return failed('Error listing expected payments:', error, 'Failed to fetch expected payments.');
    }
  });
}

export type SummaryFigure = { total: DecimalString; count: number; countedBy: 'issue_date' | 'due_date' | 'none' };

export type CurrencySummary = {
  currency: Currency;
  received: SummaryFigure;
  planned: SummaryFigure;
  overdue: SummaryFigure;
  allFuturePayments: SummaryFigure;
};

export type SummaryFiguresAnswer = {
  today: LocalDate;
  timeZone: string;
  period: AppliedPeriod;
  currencies: CurrencySummary[];
};

// querySummaryStats sums in SQL and casts once to float8, so each value is an exact two-decimal one.
const money = (n: number): DecimalString => n.toFixed(2);

/** `period` absent: this-month, the dashboard's default. Every currency on the issued invoices, never converted. */
export async function getSummaryFiguresAllCurrencies(
  actor: ActingFreelancer,
  period?: AssistantPeriodInput,
): Promise<ActionResult<SummaryFiguresAnswer>> {
  return Sentry.startSpan({ name: 'dashboard.assistant-summary-figures', op: 'function' }, async () => {
    const today = todayIn(actor.timeZone);
    const resolved = resolveAssistantPeriod(period ?? { preset: 'this-month' }, today);
    if ('success' in resolved) return resolved;
    try {
      const range: DashboardPeriod | null = resolved.range;
      const [start, endExclusive] = range ? periodBounds(range) : [null, null];
      const codes = await queryIssuedInvoiceCurrencies(actor);
      const currencies = await Promise.all(
        codes.map(async (currency): Promise<CurrencySummary> => {
          const s = await querySummaryStats(actor, currency, start, endExclusive, today);
          return {
            currency,
            received: { total: money(s.totalReceived), count: s.receivedCount, countedBy: 'issue_date' },
            planned: { total: money(s.totalPlanned), count: s.plannedCount, countedBy: 'due_date' },
            overdue: { total: money(s.totalOverdue), count: s.overdueCount, countedBy: 'due_date' },
            allFuturePayments: { total: money(s.allFuturePayments), count: s.allFuturePaymentsCount, countedBy: 'none' },
          };
        }),
      );
      return ok({ today, timeZone: actor.timeZone, period: resolved.applied, currencies });
    } catch (error) {
      return failed('Error fetching summary figures:', error, 'Failed to fetch summary figures.');
    }
  });
}
