import {
  DashboardHeaderSkeleton,
  DashboardStatsCardsSkeleton,
  DashboardChartSkeleton,
  DashboardDebtorsSkeleton,
  DashboardExpectedPaymentsSkeleton,
  DashboardSenderAccountsSkeleton,
  DashboardRecentInvoicesSkeleton,
} from '@/components/dashboard/skeletons';

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Header skeleton */}
          <DashboardHeaderSkeleton />

          {/* Stats Cards */}
          <DashboardStatsCardsSkeleton />

          {/* Chart */}
          <div className="px-4 lg:px-6">
            <DashboardChartSkeleton />
          </div>

          {/* Debtors & Expected Payments */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            <DashboardDebtorsSkeleton />
            <DashboardExpectedPaymentsSkeleton />
          </div>

          {/* Sender Accounts (Funds by Account) */}
          <div className="px-4 lg:px-6">
            <DashboardSenderAccountsSkeleton />
          </div>

          {/* Recent Invoices Table */}
          <DashboardRecentInvoicesSkeleton />
        </div>
      </div>
    </div>
  );
}
