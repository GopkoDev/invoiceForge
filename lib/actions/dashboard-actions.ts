'use server';

import { unstable_cache } from 'next/cache';
import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import { ActionResult } from '@/types/actions';
import {
  CurrencyTab,
  DashboardSummaryStats,
  ChartDataPoint,
  SenderAccountMetrics,
  AccountMetrics,
  RecentInvoice,
  DashboardData,
  DashboardIndependentData,
  DebtorInfo,
  ExpectedPaymentGroup,
  ExpectedPaymentItem,
} from '@/types/dashboard';
import { Currency, InvoiceStatus } from '@prisma/client';
import {
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
  differenceInDays,
} from 'date-fns';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Validation Schemas (Zod)
// ─────────────────────────────────────────────────────────────────────────────
const CurrencySchema = z.enum(['USD', 'EUR', 'UAH', 'GBP', 'PLN']);

const DateRangeSchema = z.object({
  dateFrom: z.date().optional().nullable(),
  dateTo: z.date().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache Configuration
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_TAGS = {
  dashboard: 'dashboard',
  currencyTabs: 'dashboard-currency-tabs',
  stats: 'dashboard-stats',
  chart: 'dashboard-chart',
  debtors: 'dashboard-debtors',
  payments: 'dashboard-payments',
  invoices: 'dashboard-invoices',
  accounts: 'dashboard-accounts',
} as const;

// 60 seconds cache for dashboard data
const CACHE_REVALIDATE = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Currency Tabs (Cached)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal function to fetch currency tabs
 */
async function fetchCurrencyTabs(userId: string): Promise<CurrencyTab[]> {
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
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;

    // Create cached version per user
    const getCachedCurrencyTabs = unstable_cache(
      () => fetchCurrencyTabs(userId),
      [`currency-tabs-${userId}`],
      {
        tags: [CACHE_TAGS.currencyTabs, CACHE_TAGS.dashboard],
        revalidate: CACHE_REVALIDATE,
      }
    );

    const data = await getCachedCurrencyTabs();
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching dashboard currency tabs:', error);
    return { success: false, error: 'Failed to fetch currency tabs' };
  }
}

/**
 * Get dashboard summary statistics filtered by currency and date range
 */
export async function getDashboardSummaryStats(
  currency: Currency,
  dateFrom?: Date | null,
  dateTo?: Date | null
): Promise<ActionResult<DashboardSummaryStats>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;

    const dateFilter =
      dateFrom && dateTo
        ? {
            issueDate: {
              gte: startOfDay(dateFrom),
              lte: endOfDay(dateTo),
            },
          }
        : {};

    const baseWhere = {
      senderProfile: { userId },
      currency,
      status: { not: 'DRAFT' as InvoiceStatus },
      ...dateFilter,
    };

    const [paidResult, pendingResult, overdueResult, allResult] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: { ...baseWhere, status: 'PAID' },
          _sum: { total: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: { ...baseWhere, status: 'PENDING' },
          _sum: { total: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: { ...baseWhere, status: 'OVERDUE' },
          _sum: { total: true },
          _count: true,
        }),
        prisma.invoice.count({
          where: baseWhere,
        }),
      ]);

    return {
      success: true,
      data: {
        totalReceived: paidResult._sum.total?.toNumber() ?? 0,
        receivedCount: paidResult._count,
        totalPlanned: pendingResult._sum.total?.toNumber() ?? 0,
        plannedCount: pendingResult._count,
        totalOverdue: overdueResult._sum.total?.toNumber() ?? 0,
        overdueCount: overdueResult._count,
        totalInvoices: allResult,
      },
    };
  } catch (error) {
    console.error('Error fetching dashboard summary stats:', error);
    return { success: false, error: 'Failed to fetch summary statistics' };
  }
}

/**
 * Get chart data for financial performance
 * - Paid line: historical data + flat projection at today's value into future
 * - Expected line: overlays paid in past + cumulative planned payments in future
 */
export async function getDashboardChartData(
  currency: Currency,
  dateFrom?: Date | null,
  dateTo?: Date | null
): Promise<ActionResult<ChartDataPoint[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;

    // Default to current month if no dates provided
    const now = new Date();
    const today = startOfDay(now);
    const from = dateFrom ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = dateTo ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Determine granularity based on date range
    const daysDiff = differenceInDays(to, from);
    let intervals: Date[];

    if (daysDiff <= 31) {
      // Daily for up to 1 month
      intervals = eachDayOfInterval({ start: from, end: to });
    } else if (daysDiff <= 180) {
      // Weekly for up to 6 months
      intervals = eachWeekOfInterval({ start: from, end: to });
    } else {
      // Monthly for longer periods
      intervals = eachMonthOfInterval({ start: from, end: to });
    }

    // Fetch all paid invoices (historical data)
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
        status: 'PAID' as InvoiceStatus,
        issueDate: {
          lte: endOfDay(to),
        },
      },
      select: {
        issueDate: true,
        total: true,
      },
      orderBy: { issueDate: 'asc' },
    });

    // Fetch all pending/overdue invoices (future planned payments)
    const plannedInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
        status: { in: ['PENDING', 'OVERDUE'] as InvoiceStatus[] },
        dueDate: {
          gte: startOfDay(from),
        },
      },
      select: {
        dueDate: true,
        total: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    // Calculate cumulative paid amount up to today
    let cumulativePaidToToday = 0;
    const paidByDate = new Map<string, number>();

    for (const invoice of paidInvoices) {
      const invoiceDate = startOfDay(new Date(invoice.issueDate));
      const amount = invoice.total?.toNumber() ?? 0;
      cumulativePaidToToday += amount;

      // Store cumulative amount for each date up to today
      if (invoiceDate <= today) {
        const dateKey = format(invoiceDate, 'yyyy-MM-dd');
        paidByDate.set(dateKey, cumulativePaidToToday);
      }
    }

    // Group planned invoices by due date
    const plannedByDate = new Map<string, number>();
    for (const invoice of plannedInvoices) {
      const dueDate = format(
        startOfDay(new Date(invoice.dueDate)),
        'yyyy-MM-dd'
      );
      const amount = invoice.total?.toNumber() ?? 0;
      plannedByDate.set(dueDate, (plannedByDate.get(dueDate) ?? 0) + amount);
    }

    // Build chart data
    let runningPaid = 0;
    let runningExpected = cumulativePaidToToday;

    const chartData: ChartDataPoint[] = intervals.map((intervalStart) => {
      const dateKey = format(intervalStart, 'yyyy-MM-dd');
      const isPast = intervalStart < today;
      const isToday =
        format(intervalStart, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

      let paid = 0;
      let expected = 0;

      if (isPast || isToday) {
        // Past/today: show actual cumulative paid amount
        // Find the cumulative paid amount up to this date
        const paidKeys = Array.from(paidByDate.keys())
          .filter((key) => key <= dateKey)
          .sort();
        paid =
          paidKeys.length > 0
            ? (paidByDate.get(paidKeys[paidKeys.length - 1]) ?? 0)
            : 0;
        runningPaid = paid;

        // Expected line overlays paid in the past
        expected = paid;
        runningExpected = paid;
      } else {
        // Future: paid stays flat at today's value
        paid = runningPaid;

        // Expected line: add planned payments to cumulative total
        const plannedForDate = plannedByDate.get(dateKey) ?? 0;
        runningExpected += plannedForDate;
        expected = runningExpected;
      }

      return {
        date: dateKey,
        paid,
        expected,
      };
    });

    return { success: true, data: chartData };
  } catch (error) {
    console.error('Error fetching dashboard chart data:', error);
    return { success: false, error: 'Failed to fetch chart data' };
  }
}

/**
 * Get sender account metrics filtered by currency and date range
 */
export async function getDashboardSenderAccounts(
  currency: Currency,
  dateFrom?: Date | null,
  dateTo?: Date | null
): Promise<ActionResult<SenderAccountMetrics[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;

    const dateFilter =
      dateFrom && dateTo
        ? {
            issueDate: {
              gte: startOfDay(dateFrom),
              lte: endOfDay(dateTo),
            },
          }
        : {};

    // Get all invoices with sender and bank account info
    const invoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
        ...dateFilter,
      },
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
        };
      }
    );

    return { success: true, data: result };
  } catch (error) {
    console.error('Error fetching dashboard sender accounts:', error);
    return { success: false, error: 'Failed to fetch sender accounts' };
  }
}

/**
 * Get recent invoices for the table (last 10, all currencies)
 */
export async function getDashboardRecentInvoices(
  currency: Currency
): Promise<ActionResult<RecentInvoice[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return { success: true, data: result };
  } catch (error) {
    console.error('Error fetching dashboard recent invoices:', error);
    return { success: false, error: 'Failed to fetch recent invoices' };
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
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return { success: true, data: result };
  } catch (error) {
    console.error('Error fetching dashboard debtors:', error);
    return { success: false, error: 'Failed to fetch debtors' };
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
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return { success: true, data: result };
  } catch (error) {
    console.error('Error fetching dashboard expected payments:', error);
    return { success: false, error: 'Failed to fetch expected payments' };
  }
}

/**
 * Get all dashboard data in a single call (filtered data)
 */
export async function getDashboardData(
  currency: Currency,
  dateFrom?: Date | null,
  dateTo?: Date | null
): Promise<ActionResult<DashboardData>> {
  try {
    const [
      currencyTabsResult,
      summaryStatsResult,
      chartDataResult,
      senderAccountsResult,
      recentInvoicesResult,
    ] = await Promise.all([
      getDashboardCurrencyTabs(),
      getDashboardSummaryStats(currency, dateFrom, dateTo),
      getDashboardChartData(currency, dateFrom, dateTo),
      getDashboardSenderAccounts(currency, dateFrom, dateTo),
      getDashboardRecentInvoices(currency),
    ]);

    if (!currencyTabsResult.success || !currencyTabsResult.data) {
      return { success: false, error: currencyTabsResult.error };
    }
    if (!summaryStatsResult.success || !summaryStatsResult.data) {
      return { success: false, error: summaryStatsResult.error };
    }
    if (!chartDataResult.success || !chartDataResult.data) {
      return { success: false, error: chartDataResult.error };
    }
    if (!senderAccountsResult.success || !senderAccountsResult.data) {
      return { success: false, error: senderAccountsResult.error };
    }
    if (!recentInvoicesResult.success || !recentInvoicesResult.data) {
      return { success: false, error: recentInvoicesResult.error };
    }

    return {
      success: true,
      data: {
        currencyTabs: currencyTabsResult.data,
        summaryStats: summaryStatsResult.data,
        chartData: chartDataResult.data,
        senderAccounts: senderAccountsResult.data,
        recentInvoices: recentInvoicesResult.data,
      },
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return { success: false, error: 'Failed to fetch dashboard data' };
  }
}

/**
 * Get independent dashboard data (not affected by filters)
 */
export async function getDashboardIndependentData(
  currency: Currency
): Promise<ActionResult<DashboardIndependentData>> {
  try {
    const [debtorsResult, expectedPaymentsResult] = await Promise.all([
      getDashboardDebtors(currency),
      getDashboardExpectedPayments(currency),
    ]);

    if (!debtorsResult.success || !debtorsResult.data) {
      return { success: false, error: debtorsResult.error };
    }
    if (!expectedPaymentsResult.success || !expectedPaymentsResult.data) {
      return { success: false, error: expectedPaymentsResult.error };
    }

    return {
      success: true,
      data: {
        debtors: debtorsResult.data,
        expectedPayments: expectedPaymentsResult.data,
      },
    };
  } catch (error) {
    console.error('Error fetching dashboard independent data:', error);
    return { success: false, error: 'Failed to fetch independent data' };
  }
}
