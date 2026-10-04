import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { Currency as CurrencyEnum, type Currency } from '@prisma/client';
import { ok, type ActionResult, type DecimalString } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { daysOverdue, todayIn, type LocalDate } from '@/lib/services/_shared/overdue';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';
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
  queryOverdueInvoicePage,
  queryOverdueTotals,
} from './queries';

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
            dueDate: r.dueDate.toISOString().slice(0, 10),
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
