'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardSenderAccountsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Funds by Account</CardTitle>
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-muted/20 overflow-hidden rounded-lg border"
          >
            <div className="hover:bg-muted/40 w-full px-3 py-2 text-left transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                    <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <Skeleton className="mb-1 h-4 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
