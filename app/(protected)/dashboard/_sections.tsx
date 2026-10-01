import { Currency } from '@prisma/client';

import { DashboardStatsCards } from '@/components/dashboard/stats/dashboard-stats-cards';
import { DashboardChart } from '@/components/dashboard/chart/dashboard-chart';
import { DashboardDebtors } from '@/components/dashboard/debtors/dashboard-debtors';
import { DashboardExpectedPayments } from '@/components/dashboard/expected-payments/dashboard-expected-payments';
import { DashboardSenderAccounts } from '@/components/dashboard/sender-accounts/dashboard-sender-accounts';
import { DashboardRecentInvoices } from '@/components/dashboard/recent-invoices/dashboard-recent-invoices';
import {
  getDashboardSummaryStats,
  getDashboardChartData,
  getDashboardSenderAccounts,
  getDashboardRecentInvoices,
  getDashboardDebtors,
  getDashboardExpectedPayments,
} from '@/lib/actions/dashboard-actions';
import { unwrapPageResult } from '@/components/layout/content-area';
import type { DashboardLocalPeriod } from '@/lib/validations/search-params';

// T26 (spec.md §5 AC-28) — the dashboard's async Suspense sections, split out so
// `tests/component/dashboard-section-outcome-routing.test.tsx` can drive each loader's
// `ActionResult` directly. Each section uses the same `unwrapPageResult` mapping as every other
// AC-28 page: a `FAILED` load throws for the segment `error.tsx` boundary (SCR-17) instead of
// quietly rendering zeroed/empty data.

export async function StatsSection({
  currency,
  appliedRange,
}: {
  currency: Currency;
  appliedRange: DashboardLocalPeriod | undefined;
}) {
  const result = await getDashboardSummaryStats(currency, appliedRange);
  const stats = unwrapPageResult(result);
  return <DashboardStatsCards stats={stats} currency={currency} />;
}

export async function ChartSection({
  currency,
  appliedRange,
}: {
  currency: Currency;
  appliedRange: DashboardLocalPeriod | undefined;
}) {
  const result = await getDashboardChartData(currency, appliedRange);
  const data = unwrapPageResult(result);
  return (
    <div className="px-4 lg:px-6">
      <DashboardChart data={data} currency={currency} />
    </div>
  );
}

export async function DebtorsSection({ currency }: { currency: Currency }) {
  const result = await getDashboardDebtors(currency);
  const debtors = unwrapPageResult(result);
  return <DashboardDebtors debtors={debtors} />;
}

export async function ExpectedPaymentsSection({
  currency,
}: {
  currency: Currency;
}) {
  const result = await getDashboardExpectedPayments(currency);
  const payments = unwrapPageResult(result);
  return <DashboardExpectedPayments payments={payments} />;
}

export async function SenderAccountsSection({
  currency,
  appliedRange,
}: {
  currency: Currency;
  appliedRange: DashboardLocalPeriod | undefined;
}) {
  const result = await getDashboardSenderAccounts(currency, appliedRange);
  const accounts = unwrapPageResult(result);
  return (
    <div className="px-4 lg:px-6">
      <DashboardSenderAccounts senderAccounts={accounts} currency={currency} />
    </div>
  );
}

export async function RecentInvoicesSection({
  currency,
}: {
  currency: Currency;
}) {
  const result = await getDashboardRecentInvoices(currency);
  const invoices = unwrapPageResult(result);
  return <DashboardRecentInvoices invoices={invoices} />;
}
