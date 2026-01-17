'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Currency } from '@prisma/client';

import {
  DashboardHeader,
  DashboardStatsCards,
  DashboardDebtors,
  DashboardExpectedPayments,
  DashboardChart,
  DashboardSenderAccounts,
  DashboardRecentInvoices,
} from '@/components/dashboard';
import { DashboardSetupAlert } from '@/components/dashboard/dashboard-setup-alert';
import {
  CurrencyTab,
  DashboardSummaryStats,
  ChartDataPoint,
  SenderAccountMetrics,
  RecentInvoice,
  DebtorInfo,
  ExpectedPaymentGroup,
} from '@/types/dashboard';
import type { SetupCheckResult } from '@/lib/actions/dashboard-setup-check';
import {
  getDashboardSummaryStats,
  getDashboardChartData,
  getDashboardSenderAccounts,
  getDashboardRecentInvoices,
  getDashboardDebtors,
  getDashboardExpectedPayments,
} from '@/lib/actions/dashboard-actions';
import {
  DashboardStatsCardsSkeleton,
  DashboardChartSkeleton,
  DashboardDebtorsSkeleton,
  DashboardExpectedPaymentsSkeleton,
  DashboardSenderAccountsSkeleton,
  DashboardRecentInvoicesSkeleton,
} from '@/components/dashboard/skeletons';

interface DashboardClientProps {
  initialCurrencyTabs: CurrencyTab[];
  initialCurrency: Currency;
  initialStats: DashboardSummaryStats;
  initialChartData: ChartDataPoint[];
  initialSenderAccounts: SenderAccountMetrics[];
  recentInvoices: RecentInvoice[];
  debtors: DebtorInfo[];
  expectedPayments: ExpectedPaymentGroup[];
  setupStatus: SetupCheckResult;
}

export function DashboardClient({
  initialCurrencyTabs,
  initialCurrency,
  initialStats,
  initialChartData,
  initialSenderAccounts,
  recentInvoices,
  debtors,
  expectedPayments,
  setupStatus,
}: DashboardClientProps) {
  const [isPending, startTransition] = useTransition();

  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [currency, setCurrency] = React.useState<Currency>(initialCurrency);
  const [isInitialized, setIsInitialized] = React.useState(false);

  // Filtered data state
  const [stats, setStats] = React.useState(initialStats);
  const [chartData, setChartData] = React.useState(initialChartData);
  const [senderAccounts, setSenderAccounts] = React.useState(
    initialSenderAccounts
  );
  const [debtorsData, setDebtorsData] = React.useState(debtors);
  const [expectedPaymentsData, setExpectedPaymentsData] =
    React.useState(expectedPayments);
  const [recentInvoicesData, setRecentInvoicesData] =
    React.useState(recentInvoices);

  // Mark as initialized after first render to prevent unnecessary loading
  React.useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Refetch data when filters change
  const refetchFilteredData = React.useCallback(
    (newCurrency: Currency, newDateRange: DateRange | undefined) => {
      startTransition(async () => {
        const [
          statsResult,
          chartResult,
          senderAccountsResult,
          debtorsResult,
          expectedPaymentsResult,
          recentInvoicesResult,
        ] = await Promise.all([
          getDashboardSummaryStats(
            newCurrency,
            newDateRange?.from,
            newDateRange?.to
          ),
          getDashboardChartData(
            newCurrency,
            newDateRange?.from,
            newDateRange?.to
          ),
          getDashboardSenderAccounts(
            newCurrency,
            newDateRange?.from,
            newDateRange?.to
          ),
          getDashboardDebtors(newCurrency),
          getDashboardExpectedPayments(newCurrency),
          getDashboardRecentInvoices(newCurrency),
        ]);

        if (statsResult.success && statsResult.data) {
          setStats(statsResult.data);
        }
        if (chartResult.success && chartResult.data) {
          setChartData(chartResult.data);
        }
        if (senderAccountsResult.success && senderAccountsResult.data) {
          setSenderAccounts(senderAccountsResult.data);
        }
        if (debtorsResult.success && debtorsResult.data) {
          setDebtorsData(debtorsResult.data);
        }
        if (expectedPaymentsResult.success && expectedPaymentsResult.data) {
          setExpectedPaymentsData(expectedPaymentsResult.data);
        }
        if (recentInvoicesResult.success && recentInvoicesResult.data) {
          setRecentInvoicesData(recentInvoicesResult.data);
        }
      });
    },
    []
  );

  const handleCurrencyChange = (newCurrency: Currency) => {
    setCurrency(newCurrency);
    if (isInitialized) {
      refetchFilteredData(newCurrency, dateRange);
    }
  };

  const handleDateRangeChange = (newDateRange: DateRange | undefined) => {
    setDateRange(newDateRange);
    if (isInitialized) {
      refetchFilteredData(currency, newDateRange);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Header with filters */}
          <DashboardHeader
            currencyTabs={initialCurrencyTabs}
            selectedCurrency={currency}
            onCurrencyChange={handleCurrencyChange}
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
          />

          {/* Setup Alert */}
          <DashboardSetupAlert setupStatus={setupStatus} />

          {/* Stats Cards */}
          {isPending ? (
            <DashboardStatsCardsSkeleton />
          ) : (
            <DashboardStatsCards stats={stats} currency={currency} />
          )}

          {/* Chart */}
          <div className="px-4 lg:px-6">
            {isPending ? (
              <DashboardChartSkeleton />
            ) : (
              <DashboardChart data={chartData} currency={currency} />
            )}
          </div>

          {/* Independent sections (Debtors & Expected Payments) - Always visible */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            {isPending ? (
              <>
                <DashboardDebtorsSkeleton />
                <DashboardExpectedPaymentsSkeleton />
              </>
            ) : (
              <>
                <DashboardDebtors debtors={debtorsData} />
                <DashboardExpectedPayments payments={expectedPaymentsData} />
              </>
            )}
          </div>

          {/* Sender Accounts (Funds by Account) */}
          <div className="px-4 lg:px-6">
            {isPending ? (
              <DashboardSenderAccountsSkeleton />
            ) : (
              <DashboardSenderAccounts
                senderAccounts={senderAccounts}
                currency={currency}
              />
            )}
          </div>

          {/* Recent Invoices Table */}
          {isPending ? (
            <DashboardRecentInvoicesSkeleton />
          ) : (
            <DashboardRecentInvoices
              invoices={recentInvoicesData}
              onDataChange={() => refetchFilteredData(currency, dateRange)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
