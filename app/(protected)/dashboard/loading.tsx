import {
  DashboardHeaderSkeleton,
  DashboardStatsCardsSkeleton,
  DashboardChartSkeleton,
  DashboardDebtorsSkeleton,
  DashboardExpectedPaymentsSkeleton,
  DashboardSenderAccountsSkeleton,
  DashboardRecentInvoicesSkeleton,
} from '@/components/dashboard';

export default function DashboardLoading() {
  return (
    <>
      <DashboardHeaderSkeleton />

      <DashboardStatsCardsSkeleton />

      <div className="px-4 lg:px-6">
        <DashboardChartSkeleton />
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <DashboardDebtorsSkeleton />
        <DashboardExpectedPaymentsSkeleton />
      </div>

      <div className="px-4 lg:px-6">
        <DashboardSenderAccountsSkeleton />
      </div>

      <DashboardRecentInvoicesSkeleton />
    </>
  );
}
