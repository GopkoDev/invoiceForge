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
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    const baseWhere = {
      senderProfile: { userId },
      currency,
      status: { not: 'DRAFT' as InvoiceStatus },
    };

    // For paid invoices, filter by issueDate
    const paidWhere =
      dateFrom && dateTo
        ? {
            ...baseWhere,
            status: 'PAID' as InvoiceStatus,
            issueDate: {
              gte: startOfDay(dateFrom),
              lte: endOfDay(dateTo),
            },
          }
        : { ...baseWhere, status: 'PAID' as InvoiceStatus };

    // For pending/overdue invoices, filter by dueDate
    const pendingWhere =
      dateFrom && dateTo
        ? {
            ...baseWhere,
            status: 'PENDING' as InvoiceStatus,
            dueDate: {
              gte: startOfDay(dateFrom),
              lte: endOfDay(dateTo),
            },
          }
        : { ...baseWhere, status: 'PENDING' as InvoiceStatus };

    const overdueWhere =
      dateFrom && dateTo
        ? {
            ...baseWhere,
            status: 'OVERDUE' as InvoiceStatus,
            dueDate: {
              gte: startOfDay(dateFrom),
              lte: endOfDay(dateTo),
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

    return {
      success: true,
      data: {
        totalReceived: paidResult._sum.total?.toNumber() ?? 0,
        receivedCount: paidResult._count,
        totalPlanned: pendingResult._sum.total?.toNumber() ?? 0,
        plannedCount: pendingResult._count,
        totalOverdue: overdueResult._sum.total?.toNumber() ?? 0,
        overdueCount: overdueResult._count,
        allFuturePayments: allFutureResult._sum.total?.toNumber() ?? 0,
        allFuturePaymentsCount: allFutureResult._count,
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

    // Fetch paid invoices within the selected date range only
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        senderProfile: { userId },
        currency,
        status: 'PAID' as InvoiceStatus,
        issueDate: {
          gte: startOfDay(from),
          lte: endOfDay(to),
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
          gte: startOfDay(from),
          lte: endOfDay(to),
        },
      },
      select: {
        dueDate: true,
        total: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    // Build map of paid amounts by date (within selected range)
    const paidByDate = new Map<string, number>();
    for (const invoice of paidInvoices) {
      const invoiceDate = startOfDay(new Date(invoice.issueDate));
      const dateKey = format(invoiceDate, 'yyyy-MM-dd');
      const amount = invoice.total?.toNumber() ?? 0;
      paidByDate.set(dateKey, (paidByDate.get(dateKey) ?? 0) + amount);
    }

    // Group planned invoices by due date (within selected range)
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
    let runningExpected = 0;

    const chartData: ChartDataPoint[] = intervals.map(
      (intervalStart, index) => {
        const dateKey = format(intervalStart, 'yyyy-MM-dd');
        const isPast = intervalStart < today;
        const isToday =
          format(intervalStart, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

        // Get the next interval start or end date
        const nextIntervalStart = intervals[index + 1]
          ? intervals[index + 1]
          : endOfDay(to);

        // Sum all paid amounts that fall within this interval
        let paidForInterval = 0;
        for (const [paidDate, amount] of paidByDate.entries()) {
          const paidDateObj = new Date(paidDate);
          if (paidDateObj >= intervalStart && paidDateObj < nextIntervalStart) {
            paidForInterval += amount;
          }
        }

        // Sum all planned payments that fall within this interval
        let plannedForInterval = 0;
        for (const [plannedDate, amount] of plannedByDate.entries()) {
          const plannedDateObj = new Date(plannedDate);
          if (
            plannedDateObj >= intervalStart &&
            plannedDateObj < nextIntervalStart
          ) {
            plannedForInterval += amount;
          }
        }

        runningPaid += paidForInterval;

        if (isPast || isToday) {
          // Past/today: expected line follows paid line
          runningExpected = runningPaid;
        } else {
          // Future: expected line includes planned payments
          runningExpected += plannedForInterval;
        }

        const paid = runningPaid;
        const expected = runningExpected;

        return {
          date: dateKey,
          paid,
          expected,
        };
      }
    );

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

    // Build filter for invoices within date range
    // For paid invoices use issueDate, for pending/overdue use dueDate
    type InvoiceWhereInput = NonNullable<
      Parameters<typeof prisma.invoice.findMany>[0]
    >['where'];

    let invoiceFilter: InvoiceWhereInput = {
      senderProfile: { userId },
      currency,
    };

    if (dateFrom && dateTo) {
      invoiceFilter = {
        ...invoiceFilter,
        OR: [
          {
            // Paid invoices by issue date
            status: 'PAID' as InvoiceStatus,
            issueDate: {
              gte: startOfDay(dateFrom),
              lte: endOfDay(dateTo),
            },
          },
          {
            // Pending/Overdue invoices by due date
            status: { in: ['PENDING', 'OVERDUE'] as InvoiceStatus[] },
            dueDate: {
              gte: startOfDay(dateFrom),
              lte: endOfDay(dateTo),
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

    return { success: true, data: result };
  } catch (error) {
    console.error('Error fetching dashboard sender accounts:', error);
    return { success: false, error: 'Failed to fetch sender accounts' };
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
