import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function DashboardStatsCardsSkeleton() {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} data-slot="card" className="@container/card">
          <CardHeader>
            <CardDescription>
              <Skeleton className="h-5 w-28" />
            </CardDescription>
            <CardTitle className="text-base leading-normal font-medium @[250px]/card:text-sm">
              <div className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                <Skeleton className="h-8 w-32 @[250px]/card:h-9" />
              </div>
            </CardTitle>
            <CardAction>
              <Skeleton className="h-5 w-16 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <Skeleton className="h-5 w-16" />
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
