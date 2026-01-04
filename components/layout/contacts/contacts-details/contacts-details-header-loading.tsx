import { Skeleton } from '@/components/ui/skeleton';

export function ContactsDetailsHeaderLoading() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* Back button skeleton */}
        <Skeleton className="h-9 w-9 rounded-md" />

        <div className="space-y-2">
          {/* Title skeleton */}
          <Skeleton className="h-9 w-64" />
          {/* Description skeleton */}
          <Skeleton className="h-5 w-48" />
        </div>
      </div>

      {/* Edit button skeleton */}
      <Skeleton className="h-9 w-20 rounded-md" />
    </div>
  );
}
