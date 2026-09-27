'use server';

import { unstable_cache } from 'next/cache';
import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import { ActionResult, ok, fail } from '@/types/actions';
import {
  CurrencyTab,
  DashboardSummaryStats,
  ChartDataPoint,
  SenderAccountMetrics,
  AccountMetrics,
  RecentInvoice,
  DebtorInfo,
  ExpectedPaymentGroup,
  ExpectedPaymentItem,
} from '@/types/dashboard';
import { Currency, InvoiceStatus } from '@prisma/client';
import type { DashboardAppliedRange } from '@/lib/validations/search-params';
import {
  currentLocalMonth,
  formatLocalDateKey,
  startOfLocalDay,
} from '@/lib/helpers/time-zone';

const CACHE_TAGS = {
  dashboard: 'dashboard',
  currencyTabs: 'dashboard-currency-tabs',
} as const;

// 60 seconds cache for dashboard data
const CACHE_REVALIDATE = 60;

async function _fetchCurrencyTabs(userId: string): Promise<CurrencyTab[]> {
  const bankAccounts = await prisma.bankAccount.findMany({
    where: {
      senderProfile: { userId },
    },
    select: {
      currency: true,
    },
    distinct: ['currency'],
  });

  const currencyTabs: CurrencyTab[] = bankAccounts.map((ba) => ({
    currency: ba.currency,
    label: ba.currency,
  }));

  // Ensure at least USD is available as default
  if (currencyTabs.length === 0) {
    currencyTabs.push({ currency: 'USD' as Currency, label: 'USD' });
  }

  return currencyTabs;
}

/**
 * Get available currency tabs based on user's bank accounts
 * Cached for 60 seconds per user
 */
export async function getDashboardCurrencyTabs(): Promise<
  ActionResult<CurrencyTab[]>
> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    // Create cached version per user
    const getCachedCurrencyTabs = unstable_cache(
      () => _fetchCurrencyTabs(userId),
      [`currency-tabs-${userId}`],
      {
        tags: [CACHE_TAGS.currencyTabs, CACHE_TAGS.dashboard],
        revalidate: CACHE_REVALIDATE,
      }
    );

    const data = await getCachedCurrencyTabs();
    return ok(data);
  } catch (error) {
    console.error('Error fetching dashboard currency tabs:', error);
    return fail('FAILED', 'Failed to fetch currency tabs.');
  }
}

/**
 * Get dashboard summary statistics filtered by currency and date range
 */
export async function getDashboardSummaryStats(
  currency: Currency,
  appliedRange?: DashboardAppliedRange
): Promise<ActionResult<DashboardSummaryStats>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const baseWhere = {
      senderProfile: { userId },
      currency,
      status: { not: 'DRAFT' as InvoiceStatus },
    };

    // For paid invoices, filter by issueDate
    const paidWhere = appliedRange
      ? {
          ...baseWhere,
          status: 'PAID' as InvoiceStatus,
          issueDate: {
            gte: appliedRange.start,
            lt: appliedRange.endExclusive,
          },
        }
      : { ...baseWhere, status: 'PAID' as InvoiceStatus };

    // For pending/overdue invoices, filter by dueDate
    const pendingWhere = appliedRange
      ? {
          ...baseWhere,
          status: 'PENDING' as InvoiceStatus,
          dueDate: {
            gte: appliedRange.start,
            lt: appliedRange.endExclusive,
          },
        }
      : { ...baseWhere, status: 'PENDING' as InvoiceStatus };

    const overdueWhere = appliedRange
      ? {
          ...baseWhere,
          status: 'OVERDUE' as InvoiceStatus,
          dueDate: {
            gte: appliedRange.start,
            lt: appliedRange.endExclusive,
          },
        }
      : { ...baseWhere, status: 'OVERDUE' as InvoiceStatus };

    // All future payments (pending + overdue) - NO date filter
    const allFutureWhere = {
      senderProfile: { userId },
      currency,
      status: { in: ['PENDING', 'OVERDUE'] as InvoiceStatus[] },
    };

    const [paidResult, pendingResult, overdueResult, allFutureResult] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: paidWhere,
          _sum: { total: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: pendingWhere,
          _sum: { total: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: overdueWhere,
          _sum: { total: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: allFutureWhere,
          _sum: { total: true },
          _count: true,
        }),
      ]);

    return ok({
      totalReceived: paidResult._sum.total?.toNumber() ?? 0,
      receivedCount: paidResult._count,
      totalPlanned: pendingResult._sum.total?.toNumber() ?? 0,
      plannedCount: pendingResult._count,
      totalOverdue: overdueResult._sum.total?.toNumber() ?? 0,
      overdueCount: overdueResult._count,
      allFuturePayments: allFutureResult._sum.total?.toNumber() ?? 0,
      allFuturePaymentsCount: allFutureResult._count,
    });
  } catch (error) {
    console.error('Error fetching dashboard summary stats:', error);
    return fail('FAILED', 'Failed to fetch summary statistics.');
  }
}

/**
 * Get chart data for financial performance
 * - Paid line: historical data + flat projection at today's value into future
 * - Expected line: overlays paid in past + cumulative planned payments in future
 */
export async function getDashboardChartData(
  currency: Currency,
  appliedRange?: DashboardAppliedRange,
  timeZone: string = 'UTC'
): Promise<ActionResult<ChartDataPoint[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    // T38 (review-2026-09-27 F-31) — `appliedRange` is already local-day-aligned in the
    // Freelancer's own time zone (search-params.ts's `localDayRange`/`currentLocalMonth`,
    // ADR-0010); querying and grouping must stay in that zone end-to-end instead of re-deriving
    // server-zone `startOfDay`/`endOfDay` bounds, which shifted both the query window and the
    // per-day grouping key for anyone whose local day doesn't line up with the server's.
    const [rangeStart, rangeEndExclusive] = appliedRange
      ? [appliedRange.start, appliedRange.endExclusive]
      : currentLocalMonth(timeZone);

    const todayKey = formatLocalDateKey(new Date(), timeZone);

    // Local-day buckets spanning [rangeStart, rangeEndExclusive). Stepping by 25h before
    // re-snapping to local midnight safely crosses any DST transition in `timeZone` without
    // ever landing on the wrong day.
    const dayKeys: string[] = [];
    let cursor = startOfLocalDay(rangeStart, timeZone);
    while (cursor.getTime() < rangeEndExclusive.getTime()) {
      dayKeys.push(formatLocalDateKey(cursor, timeZone));
      cursor = startOfLocalDay(new Date(cursor.getTime() + 25 * 60 * 60 * 1000), timeZone);
    }

    // Determine granularity based on the local day count.
    const daysDiff = dayKeys.length;

    // Fetch paid invoices within the selected date range only
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
        status: 'PAID' as InvoiceStatus,
        issueDate: {
          gte: rangeStart,
          lt: rangeEndExclusive,
        },
      },
      select: {
        issueDate: true,
        total: true,
      },
      orderBy: { issueDate: 'asc' },
    });

    // Fetch pending/overdue invoices within the selected date range
    const plannedInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
        status: { in: ['PENDING', 'OVERDUE'] as InvoiceStatus[] },
        dueDate: {
          gte: rangeStart,
          lt: rangeEndExclusive,
        },
      },
      select: {
        dueDate: true,
        total: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    // Group paid amounts by the Freelancer's local calendar day (within selected range)
    const paidByDate = new Map<string, number>();
    for (const invoice of paidInvoices) {
      const dateKey = formatLocalDateKey(new Date(invoice.issueDate), timeZone);
      const amount = invoice.total?.toNumber() ?? 0;
      paidByDate.set(dateKey, (paidByDate.get(dateKey) ?? 0) + amount);
    }

    // Group planned invoices by due date, same local calendar day (within selected range)
    const plannedByDate = new Map<string, number>();
    for (const invoice of plannedInvoices) {
      const dateKey = formatLocalDateKey(new Date(invoice.dueDate), timeZone);
      const amount = invoice.total?.toNumber() ?? 0;
      plannedByDate.set(dateKey, (plannedByDate.get(dateKey) ?? 0) + amount);
    }

    // Roll the local-day buckets up into daily/weekly/monthly display groups. `yyyy-MM-dd` keys
    // sort and compare lexicographically, so grouping/comparison never needs to re-parse a key
    // back into a Date (the round trip that used to reintroduce the server's own zone).
    const dayGroups: string[][] = [];
    if (daysDiff <= 31) {
      // Daily for up to 1 month
      for (const dateKey of dayKeys) {
        dayGroups.push([dateKey]);
      }
    } else if (daysDiff <= 180) {
      // Weekly for up to 6 months
      for (let i = 0; i < dayKeys.length; i += 7) {
        dayGroups.push(dayKeys.slice(i, i + 7));
      }
    } else {
      // Monthly for longer periods, grouped by the local yyyy-MM prefix
      let currentMonth = '';
      for (const dateKey of dayKeys) {
        const monthKey = dateKey.slice(0, 7);
        if (monthKey !== currentMonth) {
          dayGroups.push([]);
          currentMonth = monthKey;
        }
        dayGroups[dayGroups.length - 1].push(dateKey);
      }
    }

    // Build chart data
    let runningPaid = 0;
    let runningExpected = 0;

    const chartData: ChartDataPoint[] = dayGroups.map((group) => {
      const dateKey = group[0];
      const isPastOrToday = dateKey <= todayKey;

      let paidForInterval = 0;
      let plannedForInterval = 0;
      for (const day of group) {
        paidForInterval += paidByDate.get(day) ?? 0;
        plannedForInterval += plannedByDate.get(day) ?? 0;
      }

      runningPaid += paidForInterval;

      if (isPastOrToday) {
        // Past/today: expected line follows paid line
        runningExpected = runningPaid;
      } else {
        // Future: expected line includes planned payments
        runningExpected += plannedForInterval;
      }

      return {
        date: dateKey,
        paid: runningPaid,
        expected: runningExpected,
      };
    });

    return ok(chartData);
  } catch (error) {
    console.error('Error fetching dashboard chart data:', error);
    return fail('FAILED', 'Failed to fetch chart data.');
  }
}

/**
 * Get sender account metrics filtered by currency and date range
 */
export async function getDashboardSenderAccounts(
  currency: Currency,
  appliedRange?: DashboardAppliedRange
): Promise<ActionResult<SenderAccountMetrics[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    // Build filter for invoices within date range
    // For paid invoices use issueDate, for pending/overdue use dueDate
    type InvoiceWhereInput = NonNullable<
      Parameters<typeof prisma.invoice.findMany>[0]
    >['where'];

    let invoiceFilter: InvoiceWhereInput = {
      senderProfile: { userId },
      currency,
    };

    if (appliedRange) {
      invoiceFilter = {
        ...invoiceFilter,
        OR: [
          {
            // Paid invoices by issue date
            status: 'PAID' as InvoiceStatus,
            issueDate: {
              gte: appliedRange.start,
              lt: appliedRange.endExclusive,
            },
          },
          {
            // Pending/Overdue invoices by due date
            status: { in: ['PENDING', 'OVERDUE'] as InvoiceStatus[] },
            dueDate: {
              gte: appliedRange.start,
              lt: appliedRange.endExclusive,
            },
          },
        ],
      };
    }

    // Get all invoices with sender and bank account info (filtered by date)
    const invoices = await prisma.invoice.findMany({
      where: invoiceFilter,
      select: {
        total: true,
        status: true,
        senderName: true,
        senderProfileId: true,
        bankAccountId: true,
        accountName: true,
        bankName: true,
      },
    });

    // Get ALL future invoices (no date filter) for the "all future planned" metric
    const allFutureInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
        status: { in: ['PENDING', 'OVERDUE'] as InvoiceStatus[] },
      },
      select: {
        total: true,
        senderProfileId: true,
        bankAccountId: true,
      },
    });

    // Aggregate by sender -> account
    const senderMap = new Map<
      string,
      {
        senderProfileId: string;
        senderName: string;
        accounts: Map<
          string,
          {
            accountId: string;
            accountName: string;
            bankName: string;
            received: number;
            planned: number;
          }
        >;
      }
    >();

    invoices.forEach((inv) => {
      const senderKey = inv.senderProfileId;
      const accountKey = inv.bankAccountId;

      if (!senderMap.has(senderKey)) {
        senderMap.set(senderKey, {
          senderProfileId: inv.senderProfileId,
          senderName: inv.senderName,
          accounts: new Map(),
        });
      }

      const sender = senderMap.get(senderKey)!;

      if (!sender.accounts.has(accountKey)) {
        sender.accounts.set(accountKey, {
          accountId: inv.bankAccountId,
          accountName: inv.accountName,
          bankName: inv.bankName,
          received: 0,
          planned: 0,
        });
      }

      const account = sender.accounts.get(accountKey)!;
      const amount = inv.total?.toNumber() ?? 0;

      if (inv.status === 'PAID') {
        account.received += amount;
      } else if (inv.status === 'PENDING' || inv.status === 'OVERDUE') {
        account.planned += amount;
      }
    });

    // Calculate all future planned per sender
    const allFutureBySender = new Map<string, number>();
    allFutureInvoices.forEach((inv) => {
      const amount = inv.total?.toNumber() ?? 0;
      allFutureBySender.set(
        inv.senderProfileId,
        (allFutureBySender.get(inv.senderProfileId) ?? 0) + amount
      );
    });

    // Convert to array structure
    const result: SenderAccountMetrics[] = Array.from(senderMap.values()).map(
      (sender) => {
        const accounts: AccountMetrics[] = Array.from(sender.accounts.values());
        return {
          senderProfileId: sender.senderProfileId,
          senderName: sender.senderName,
          totalReceived: accounts.reduce((sum, a) => sum + a.received, 0),
          totalPlanned: accounts.reduce((sum, a) => sum + a.planned, 0),
          accounts,
          allFuturePlanned: allFutureBySender.get(sender.senderProfileId) ?? 0,
        };
      }
    );

    return ok(result);
  } catch (error) {
    console.error('Error fetching dashboard sender accounts:', error);
    return fail('FAILED', 'Failed to fetch sender accounts.');
  }
}

/**
 * Get recent invoices for the table (last 10, selected currency)
 */
export async function getDashboardRecentInvoices(
  currency: Currency
): Promise<ActionResult<RecentInvoice[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const invoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
        status: true,
        issueDate: true,
        dueDate: true,
        total: true,
        currency: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const result: RecentInvoice[] = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: inv.total?.toNumber() ?? 0,
      currency: inv.currency,
    }));

    return ok(result);
  } catch (error) {
    console.error('Error fetching dashboard recent invoices:', error);
    return fail('FAILED', 'Failed to fetch recent invoices.');
  }
}

/**
 * Get debtors (customers with overdue invoices) - filtered by currency
 */
export async function getDashboardDebtors(
  currency: Currency
): Promise<ActionResult<DebtorInfo[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    // Get all overdue invoices filtered by currency
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        status: 'OVERDUE',
        currency,
      },
      select: {
        customerId: true,
        customerName: true,
        total: true,
        currency: true,
      },
    });

    // Aggregate by customer
    const customerMap = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        total: number;
        count: number;
        currencies: Set<string>;
      }
    >();

    overdueInvoices.forEach((inv) => {
      const key = inv.customerId;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customerId: inv.customerId,
          customerName: inv.customerName,
          total: 0,
          count: 0,
          currencies: new Set(),
        });
      }

      const customer = customerMap.get(key)!;
      customer.total += inv.total?.toNumber() ?? 0;
      customer.count += 1;
      customer.currencies.add(inv.currency);
    });

    const result: DebtorInfo[] = Array.from(customerMap.values())
      .map((c) => ({
        customerId: c.customerId,
        customerName: c.customerName,
        total: c.total,
        count: c.count,
        currencies: Array.from(c.currencies),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3); // Top 3 by debt amount

    return ok(result);
  } catch (error) {
    console.error('Error fetching dashboard debtors:', error);
    return fail('FAILED', 'Failed to fetch debtors.');
  }
}

/**
 * Get expected payments (pending invoices) - filtered by currency
 */
export async function getDashboardExpectedPayments(
  currency: Currency
): Promise<ActionResult<ExpectedPaymentGroup[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    // Get all pending invoices filtered by currency
    const pendingInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        status: 'PENDING',
        currency,
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
        total: true,
        currency: true,
        dueDate: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    // Group by currency
    const currencyMap = new Map<
      Currency,
      {
        invoices: ExpectedPaymentItem[];
        total: number;
      }
    >();

    pendingInvoices.forEach((inv) => {
      if (!currencyMap.has(inv.currency)) {
        currencyMap.set(inv.currency, { invoices: [], total: 0 });
      }

      const group = currencyMap.get(inv.currency)!;
      group.invoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        total: inv.total?.toNumber() ?? 0,
        currency: inv.currency,
        dueDate: inv.dueDate,
      });
      group.total += inv.total?.toNumber() ?? 0;
    });

    const result: ExpectedPaymentGroup[] = Array.from(
      currencyMap.entries()
    ).map(([currency, data]) => ({
      currency,
      invoices: data.invoices.slice(0, 3), // Top 3 per currency
      total: data.total,
      count: data.invoices.length,
    }));

    return ok(result);
  } catch (error) {
    console.error('Error fetching dashboard expected payments:', error);
    return fail('FAILED', 'Failed to fetch expected payments.');
  }
}
