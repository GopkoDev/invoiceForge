import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DashboardStatsCardsSkeleton } from './dashboard-stats-cards-skeleton';
import { DashboardChartSkeleton } from './dashboard-chart-skeleton';
import { DashboardTableSkeleton } from './dashboard-table-skeleton';

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <Skeleton className="h-10 w-60" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-50" />
        <Skeleton className="h-10 w-35" />
      </div>
    </div>
  );
}

function IndependentCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div
                  key={j}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SenderAccountsSkeleton() {
  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-12" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="bg-muted/20 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="mt-1 h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-4" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <HeaderSkeleton />
          <IndependentCardsSkeleton />
          <DashboardStatsCardsSkeleton />
          <div className="px-4 lg:px-6">
            <DashboardChartSkeleton />
          </div>
          <SenderAccountsSkeleton />
          <DashboardTableSkeleton />
        </div>
      </div>
    </div>
  );
}
