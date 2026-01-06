import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface InfoItemSkeletonProps {
  hasValue?: boolean;
}

function InfoItemSkeleton({ hasValue = true }: InfoItemSkeletonProps) {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className={`h-4 ${hasValue ? 'w-32' : 'w-24'}`} />
      </div>
    </div>
  );
}

interface SectionSkeletonProps {
  fieldsCount?: number;
}

function SectionSkeleton({ fieldsCount = 3 }: SectionSkeletonProps) {
  return (
    <div>
      <Skeleton className="h-4 w-24 mb-3" />
      <div className="space-y-3">
        {Array.from({ length: fieldsCount }).map((_, i) => (
          <InfoItemSkeleton key={`field-${i}`} />
        ))}
      </div>
    </div>
  );
}

interface ContactsDetailsSidebarLoadingProps {
  sectionsCount?: number;
  showNotes?: boolean;
  showStatistics?: boolean;
}

export function ContactsDetailsSidebarLoading({
  sectionsCount = 2,
  showNotes = false,
  showStatistics = false,
}: ContactsDetailsSidebarLoadingProps) {
  return (
    <div className="space-y-6 min-w-0">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-col items-center text-center">
            {/* Avatar skeleton */}
            <Skeleton className="h-20 w-20 rounded-full mb-4" />

            {/* Title skeleton */}
            <Skeleton className="h-6 w-40 mb-2" />

            {/* Subtitle skeleton */}
            <Skeleton className="h-4 w-32 mb-2" />

            {/* Badge skeleton */}
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-6">
          <div className="space-y-4">
            {Array.from({ length: sectionsCount }).map((_, index) => (
              <div key={`section-${index}`}>
                {index > 0 && <Separator className="mb-4" />}
                <SectionSkeleton />
              </div>
            ))}

            {showNotes && (
              <>
                <Separator />
                <div>
                  <Skeleton className="h-4 w-16 mb-2" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {showStatistics && (
        <Card className="overflow-hidden">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>

          <CardContent>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`stat-${index}`}>
                {index > 0 && <Separator className="my-2" />}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-8" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
