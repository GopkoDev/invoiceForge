import { Suspense } from 'react';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import type { Metadata } from 'next';
import { Currency } from '@prisma/client';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardHeader } from '@/components/dashboard/header/dashboard-header';
import { DashboardSetupAlert } from '@/components/dashboard/dashboard-setup-alert';
import {
  DashboardStatsCards,
  DashboardChart,
  DashboardDebtors,
  DashboardExpectedPayments,
  DashboardSenderAccounts,
  DashboardRecentInvoices,
  DashboardStatsCardsSkeleton,
  DashboardChartSkeleton,
  DashboardDebtorsSkeleton,
  DashboardExpectedPaymentsSkeleton,
  DashboardSenderAccountsSkeleton,
  DashboardRecentInvoicesSkeleton,
} from '@/components/dashboard';
import {
  getDashboardCurrencyTabs,
  getDashboardSummaryStats,
  getDashboardChartData,
  getDashboardSenderAccounts,
  getDashboardRecentInvoices,
  getDashboardDebtors,
  getDashboardExpectedPayments,
} from '@/lib/actions/dashboard-actions';
import { checkDashboardSetup } from '@/lib/actions/dashboard-setup-check';
import { getCurrenciesValues } from '@/constants/currency-options';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Overview of your invoicing performance and financial metrics.',
};

interface DashboardSearchParams {
  currency?: string;
  from?: string;
  to?: string;
  preset?: string;
}

interface DashboardPageProps {
  searchParams: Promise<DashboardSearchParams>;
}

function parseDateRange(from?: string, to?: string, preset?: string) {
  const now = new Date();

  if (preset === 'all-time') {
    return { dateFrom: undefined, dateTo: undefined };
  }

  let dateFrom = startOfMonth(now);
  let dateTo = endOfMonth(now);

  if (from && to) {
    try {
      dateFrom = parseISO(from);
      dateTo = parseISO(to);
    } catch {}
  }

  return { dateFrom, dateTo };
}

function validateCurrency(
  currency?: string,
  currencyTabs?: { currency: Currency }[]
): Currency {
  const validCurrencies: Currency[] = getCurrenciesValues();
  if (
    currency &&
    validCurrencies.includes(currency as Currency) &&
    currencyTabs?.some((tab) => tab.currency === (currency as Currency))
  ) {
    return currency as Currency;
  }

  if (currencyTabs && currencyTabs.length > 0) {
    return currencyTabs[0].currency;
  }

  return 'USD';
}

async function StatsSection({
  currency,
  dateFrom,
  dateTo,
}: {
  currency: Currency;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const result = await getDashboardSummaryStats(currency, dateFrom, dateTo);
  const stats =
    result.success && result.data
      ? result.data
      : {
          totalReceived: 0,
          receivedCount: 0,
          totalPlanned: 0,
          plannedCount: 0,
          totalOverdue: 0,
          overdueCount: 0,
          allFuturePayments: 0,
          allFuturePaymentsCount: 0,
        };
  return <DashboardStatsCards stats={stats} currency={currency} />;
}

async function ChartSection({
  currency,
  dateFrom,
  dateTo,
}: {
  currency: Currency;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const result = await getDashboardChartData(currency, dateFrom, dateTo);
  const data = result.success && result.data ? result.data : [];
  return (
    <div className="px-4 lg:px-6">
      <DashboardChart data={data} currency={currency} />
    </div>
  );
}

async function DebtorsSection({ currency }: { currency: Currency }) {
  const result = await getDashboardDebtors(currency);
  const debtors = result.success && result.data ? result.data : [];
  return <DashboardDebtors debtors={debtors} />;
}

async function ExpectedPaymentsSection({ currency }: { currency: Currency }) {
  const result = await getDashboardExpectedPayments(currency);
  const payments = result.success && result.data ? result.data : [];
  return <DashboardExpectedPayments payments={payments} />;
}

async function SenderAccountsSection({
  currency,
  dateFrom,
  dateTo,
}: {
  currency: Currency;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const result = await getDashboardSenderAccounts(currency, dateFrom, dateTo);
  const accounts = result.success && result.data ? result.data : [];
  return (
    <div className="px-4 lg:px-6">
      <DashboardSenderAccounts senderAccounts={accounts} currency={currency} />
    </div>
  );
}

async function RecentInvoicesSection({ currency }: { currency: Currency }) {
  const result = await getDashboardRecentInvoices(currency);
  const invoices = result.success && result.data ? result.data : [];
  return <DashboardRecentInvoices invoices={invoices} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;

  const [currencyTabsResult, setupStatusResult] = await Promise.all([
    getDashboardCurrencyTabs(),
    checkDashboardSetup(),
  ]);

  const currencyTabs = currencyTabsResult.success
    ? (currencyTabsResult.data ?? [])
    : [];

  const currency = validateCurrency(params.currency, currencyTabs);

  const { dateFrom, dateTo } = parseDateRange(
    params.from,
    params.to,
    params.preset
  );

  const setupStatus =
    setupStatusResult.success && setupStatusResult.data
      ? setupStatusResult.data
      : {
          hasSenderProfiles: false,
          hasBankAccounts: false,
          hasCustomers: false,
          hasProducts: false,
          isComplete: false,
        };

  const suspenseKey = `${currency}-${dateFrom?.getTime() ?? 'all'}-${dateTo?.getTime() ?? 'time'}`;

  return (
    <>
      <DashboardHeader
        currencyTabs={currencyTabs}
        selectedCurrency={currency}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />

      <DashboardSetupAlert setupStatus={setupStatus} />

      <Suspense
        key={`stats-${suspenseKey}`}
        fallback={<DashboardStatsCardsSkeleton />}
      >
        <StatsSection currency={currency} dateFrom={dateFrom} dateTo={dateTo} />
      </Suspense>

      <Suspense
        key={`chart-${suspenseKey}`}
        fallback={
          <div className="px-4 lg:px-6">
            <DashboardChartSkeleton />
          </div>
        }
      >
        <ChartSection currency={currency} dateFrom={dateFrom} dateTo={dateTo} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Suspense
          key={`debtors-${suspenseKey}`}
          fallback={<DashboardDebtorsSkeleton />}
        >
          <DebtorsSection currency={currency} />
        </Suspense>
        <Suspense
          key={`payments-${suspenseKey}`}
          fallback={<DashboardExpectedPaymentsSkeleton />}
        >
          <ExpectedPaymentsSection currency={currency} />
        </Suspense>
      </div>

      <Suspense
        key={`accounts-${suspenseKey}`}
        fallback={
          <div className="px-4 lg:px-6">
            <DashboardSenderAccountsSkeleton />
          </div>
        }
      >
        <SenderAccountsSection
          currency={currency}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </Suspense>

      <Suspense
        key={`invoices-${suspenseKey}`}
        fallback={<DashboardRecentInvoicesSkeleton />}
      >
        <RecentInvoicesSection currency={currency} />
      </Suspense>
    </>
  );
}
