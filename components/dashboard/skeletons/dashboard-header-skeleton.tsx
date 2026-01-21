import { CalendarIcon, Plus } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function DashboardHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      {/* Filters Button Skeleton */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'border-border bg-background dark:border-input dark:bg-input/30 inline-flex h-9 w-60 items-center justify-start gap-1.5 rounded-md border px-2.5 text-left text-sm font-normal shadow-xs'
          )}
        >
          <CalendarIcon className="text-muted-foreground size-4" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>

      {/* Tabs + Create Button Skeleton */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Tabs Skeleton */}
        <div className="w-50 sm:w-auto">
          <div className="bg-muted inline-flex h-9 w-fit items-center justify-center gap-0 rounded-lg p-0.75">
            <Skeleton className="h-[calc(100%-1px)] w-16 rounded-md" />
            <Skeleton className="h-[calc(100%-1px)] w-16 rounded-md" />
            <Skeleton className="h-[calc(100%-1px)] w-16 rounded-md" />
          </div>
        </div>

        {/* Create Button Skeleton */}
        <div className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium">
          <Plus className="size-4" />
          <Skeleton className="bg-primary-foreground/20 h-5 w-24" />
        </div>
      </div>
    </div>
  );
}
