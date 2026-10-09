import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { Currency, InvoiceStatus } from '@prisma/client';
import type {
  ChartDataPoint,
  CurrencyTab,
  DashboardSummaryStats,
  DebtorInfo,
  ExpectedPaymentGroup,
  RecentInvoice,
  SenderAccountMetrics,
} from '@/types/dashboard';
import { ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { derivedStatus, todayIn } from '@/lib/services/_shared/overdue';
import { currentMonthPeriod, parseDashboardInput, periodBounds, type DashboardPeriod } from './period';
import {
  queryChartBuckets,
  queryCurrencyTabs,
  queryDebtors,
  queryExpectedPayments,
  queryRecentInvoices,
  querySenderAccounts,
  querySummaryStats,
  type ChartBucketing,
} from './queries';

export type { DashboardPeriod, LocalDate } from './period';

const DAY_MS = 24 * 60 * 60 * 1000;

const utcMs = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function getCurrencyTabs(actor: ActingFreelancer): Promise<ActionResult<CurrencyTab[]>> {
  return Sentry.startSpan({ name: 'dashboard.currency-tabs', op: 'function' }, async () => {
    try {
      const currencies = await queryCurrencyTabs(actor);
      const tabs: CurrencyTab[] = currencies.map((currency) => ({ currency, label: currency }));
      // Same default as today: USD is always available.
      if (tabs.length === 0) tabs.push({ currency: 'USD', label: 'USD' });
      return ok(tabs);
    } catch (error) {
      return failed('Error fetching dashboard currency tabs:', error, 'Failed to fetch currency tabs.');
    }
  });
}

export async function getSummaryStats(
  actor: ActingFreelancer,
  currency: Currency,
  period?: DashboardPeriod,
): Promise<ActionResult<DashboardSummaryStats>> {
  return Sentry.startSpan({ name: 'dashboard.summary-stats', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, period);
    if (!input.success) return input;
    try {
      const [start, endExclusive] = input.period ? periodBounds(input.period) : [null, null];
      return ok(await querySummaryStats(actor, input.currency, start, endExclusive, todayIn(actor.timeZone)));
    } catch (error) {
      return failed('Error fetching dashboard summary stats:', error, 'Failed to fetch summary statistics.');
    }
  });
}

/** Display groups of local days, as today: daily up to 31 days, weekly up to 180, else monthly. */
function dayGroups(dayKeys: string[]): { groups: string[][]; mode: ChartBucketing['mode'] } {
  if (dayKeys.length <= 31) return { groups: dayKeys.map((k) => [k]), mode: 'day' };
  if (dayKeys.length <= 180) {
    const groups: string[][] = [];
    for (let i = 0; i < dayKeys.length; i += 7) groups.push(dayKeys.slice(i, i + 7));
    return { groups, mode: 'week' };
  }
  const groups: string[][] = [];
  let month = '';
  for (const key of dayKeys) {
    if (key.slice(0, 7) !== month) {
      groups.push([]);
      month = key.slice(0, 7);
    }
    groups[groups.length - 1].push(key);
  }
  return { groups, mode: 'month' };
}

export async function getChartData(
  actor: ActingFreelancer,
  currency: Currency,
  period?: DashboardPeriod,
): Promise<ActionResult<ChartDataPoint[]>> {
  return Sentry.startSpan({ name: 'dashboard.chart', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, period);
    if (!input.success) return input;
    try {
      const today = todayIn(actor.timeZone);
      // No period: the current month in the actor's zone, as the chart does today.
      const { from: fromKey, to: toKey_ } = input.period ?? currentMonthPeriod(today);
      const [start, endExclusive] = periodBounds({ from: fromKey, to: toKey_ });

      const dayKeys: string[] = [];
      for (let ms = utcMs(fromKey); ms <= utcMs(toKey_); ms += DAY_MS) dayKeys.push(toKey(ms));
      const { groups, mode } = dayGroups(dayKeys);

      const fromMonthIndex = Number(fromKey.slice(0, 4)) * 12 + Number(fromKey.slice(5, 7)) - 1;
      const rows = await queryChartBuckets(actor, input.currency, start, endExclusive, {
        mode,
        fromKey,
        fromMonthIndex,
      }, today);
      const byBucket = new Map(rows.map((r) => [r.bucket, r]));

      // Running totals in whole cents: the SQL sums are exact, so no float drift builds up here.
      const toCents = (n: number) => Math.round(n * 100);
      let paidCents = 0;
      let expectedCents = 0;
      const points = groups.map((group, index): ChartDataPoint => {
        const row = byBucket.get(index);
        paidCents += toCents(row?.paid ?? 0);
        if (group[0] <= today) expectedCents = paidCents;
        else expectedCents += toCents(row?.planned ?? 0);
        return { date: group[0], paid: paidCents / 100, expected: expectedCents / 100 };
      });
      return ok(points);
    } catch (error) {
      return failed('Error fetching dashboard chart data:', error, 'Failed to fetch chart data.');
    }
  });
}

const cents = (n: number) => Math.round(n * 100);

export async function getSenderAccounts(
  actor: ActingFreelancer,
  currency: Currency,
  period?: DashboardPeriod,
): Promise<ActionResult<SenderAccountMetrics[]>> {
  return Sentry.startSpan({ name: 'dashboard.sender-accounts', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, period);
    if (!input.success) return input;
    try {
      const [start, endExclusive] = input.period ? periodBounds(input.period) : [null, null];
      const rows = await querySenderAccounts(actor, input.currency, start, endExclusive, todayIn(actor.timeZone));
      // Rows arrive ordered by profile, so each profile's accounts are contiguous. Account sums are
      // exact; the profile totals add whole cents.
      const senders: SenderAccountMetrics[] = [];
      for (const row of rows) {
        let sender = senders[senders.length - 1];
        if (!sender || sender.senderProfileId !== row.senderProfileId) {
          sender = {
            senderProfileId: row.senderProfileId,
            senderName: row.senderName,
            totalReceived: 0,
            totalPlanned: 0,
            accounts: [],
            allFuturePlanned: row.allFuturePlanned,
          };
          senders.push(sender);
        }
        sender.accounts.push({
          accountId: row.accountId,
          accountName: row.accountName,
          bankName: row.bankName,
          received: row.received,
          planned: row.planned,
        });
        sender.totalReceived = (cents(sender.totalReceived) + cents(row.received)) / 100;
        sender.totalPlanned = (cents(sender.totalPlanned) + cents(row.planned)) / 100;
      }
      return ok(senders);
    } catch (error) {
      return failed('Error fetching dashboard sender accounts:', error, 'Failed to fetch sender accounts.');
    }
  });
}

export async function getRecentInvoices(
  actor: ActingFreelancer,
  currency: Currency,
): Promise<ActionResult<RecentInvoice[]>> {
  return Sentry.startSpan({ name: 'dashboard.recent-invoices', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, undefined);
    if (!input.success) return input;
    try {
      const rows = await queryRecentInvoices(actor, input.currency);
      const today = todayIn(actor.timeZone);
      return ok(
        rows.map((r): RecentInvoice => ({
          ...r,
          storedStatus: r.status as InvoiceStatus,
          // The shared rule: a past-due pending invoice shows as overdue; the stored status is untouched.
          status: derivedStatus({ status: r.status as InvoiceStatus, dueDate: r.dueDate }, today).toUpperCase() as RecentInvoice['status'],
          currency: r.currency as Currency,
        })),
      );
    } catch (error) {
      return failed('Error fetching dashboard recent invoices:', error, 'Failed to fetch recent invoices.');
    }
  });
}

export async function getDebtors(actor: ActingFreelancer, currency: Currency): Promise<ActionResult<DebtorInfo[]>> {
  return Sentry.startSpan({ name: 'dashboard.debtors', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, undefined);
    if (!input.success) return input;
    try {
      const rows = await queryDebtors(actor, input.currency, todayIn(actor.timeZone));
      return ok(rows.map((r): DebtorInfo => ({ ...r, currencies: [input.currency] })));
    } catch (error) {
      return failed('Error fetching dashboard debtors:', error, 'Failed to fetch debtors.');
    }
  });
}

export async function getExpectedPayments(
  actor: ActingFreelancer,
  currency: Currency,
): Promise<ActionResult<ExpectedPaymentGroup[]>> {
  return Sentry.startSpan({ name: 'dashboard.expected-payments', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, undefined);
    if (!input.success) return input;
    try {
      const rows = await queryExpectedPayments(actor, input.currency, todayIn(actor.timeZone));
      if (rows.length === 0) return ok([]);
      return ok([
        {
          currency: input.currency,
          invoices: rows.map((r) => ({
            id: r.id,
            invoiceNumber: r.invoiceNumber,
            customerName: r.customerName,
            total: r.total,
            currency: input.currency,
            dueDate: r.dueDate,
          })),
          total: rows[0].groupTotal,
          count: rows[0].groupCount,
        },
      ]);
    } catch (error) {
      return failed('Error fetching dashboard expected payments:', error, 'Failed to fetch expected payments.');
    }
  });
}
