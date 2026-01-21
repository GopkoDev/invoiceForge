import { Banknote, Clock, Wallet, FileText } from 'lucide-react';

import { DashboardStatCard } from './dashboard-stat-card';
import { DashboardSummaryStats } from '@/types/dashboard';

interface DashboardStatsCardsProps {
  stats: DashboardSummaryStats;
  currency: string;
}

export function DashboardStatsCards({
  stats,
  currency,
}: DashboardStatsCardsProps) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <DashboardStatCard
        title="Total Received"
        value={stats.totalReceived}
        count={stats.receivedCount}
        currency={currency}
        icon={Wallet}
        badgeText="invoices"
        footerText="Paid"
      />

      <DashboardStatCard
        title="Planned"
        value={stats.totalPlanned}
        count={stats.plannedCount}
        currency={currency}
        icon={Banknote}
        badgeText="invoices"
        footerText="Pending"
      />

      <DashboardStatCard
        title="Overdue"
        value={stats.totalOverdue}
        count={stats.overdueCount}
        currency={currency}
        icon={Clock}
        iconClassName="text-destructive"
        badgeText={stats.overdueCount === 1 ? 'Invoice' : 'Invoices'}
        badgeVariant="destructive"
        footerText="Action required"
      />

      <DashboardStatCard
        title="All Future Payments"
        value={stats.allFuturePayments}
        count={stats.allFuturePaymentsCount}
        currency={currency}
        icon={FileText}
        badgeText={stats.allFuturePaymentsCount === 1 ? 'invoice' : 'invoices'}
        footerText="Pending & Overdue"
      />
    </div>
  );
}
