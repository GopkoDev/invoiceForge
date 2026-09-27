import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Currency } from '@prisma/client';

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
import { dashboardParamsSchema, type DashboardAppliedRange } from '@/lib/validations/search-params';
import { getRequestTimeZone } from '@/lib/helpers/time-zone';

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
  appliedRange,
}: {
  currency: Currency;
  appliedRange: DashboardAppliedRange | undefined;
}) {
  const result = await getDashboardSummaryStats(currency, appliedRange);
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
  appliedRange,
}: {
  currency: Currency;
  appliedRange: DashboardAppliedRange | undefined;
}) {
  const result = await getDashboardChartData(currency, appliedRange);
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
  appliedRange,
}: {
  currency: Currency;
  appliedRange: DashboardAppliedRange | undefined;
}) {
  const result = await getDashboardSenderAccounts(currency, appliedRange);
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

  const timeZone = await getRequestTimeZone();
  const { appliedRange } = dashboardParamsSchema(timeZone).parse(params);

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

  // T24 (spec.md §6 NFR "Dashboard date-range change"; sad.md §8 Hard rule "Cache invalidation":
  // debtors/expected-payments/recent-invoices Suspense boundaries key on currency only) — sections
  // that don't take a date range never re-suspend when the range changes; sections that do take a
  // range also key on it.
  const currencyKey = currency;
  const rangeKey = `${appliedRange?.start.getTime() ?? 'all'}-${appliedRange?.endExclusive.getTime() ?? 'time'}`;

  return (
    <>
      <DashboardHeader
        currencyTabs={currencyTabs}
        selectedCurrency={currency}
        appliedRange={appliedRange}
      />

      <DashboardSetupAlert setupStatus={setupStatus} />

      <Suspense
        key={`stats-${currencyKey}-${rangeKey}`}
        fallback={<DashboardStatsCardsSkeleton />}
      >
        <StatsSection currency={currency} appliedRange={appliedRange} />
      </Suspense>

      <Suspense
        key={`chart-${currencyKey}-${rangeKey}`}
        fallback={
          <div className="px-4 lg:px-6">
            <DashboardChartSkeleton />
          </div>
        }
      >
        <ChartSection currency={currency} appliedRange={appliedRange} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Suspense
          key={`debtors-${currencyKey}`}
          fallback={<DashboardDebtorsSkeleton />}
        >
          <DebtorsSection currency={currency} />
        </Suspense>
        <Suspense
          key={`payments-${currencyKey}`}
          fallback={<DashboardExpectedPaymentsSkeleton />}
        >
          <ExpectedPaymentsSection currency={currency} />
        </Suspense>
      </div>

      <Suspense
        key={`accounts-${currencyKey}-${rangeKey}`}
        fallback={
          <div className="px-4 lg:px-6">
            <DashboardSenderAccountsSkeleton />
          </div>
        }
      >
        <SenderAccountsSection currency={currency} appliedRange={appliedRange} />
      </Suspense>

      <Suspense
        key={`invoices-${currencyKey}`}
        fallback={<DashboardRecentInvoicesSkeleton />}
      >
        <RecentInvoicesSection currency={currency} />
      </Suspense>
    </>
  );
}
