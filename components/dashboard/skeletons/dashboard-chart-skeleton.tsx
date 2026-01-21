import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function DashboardChartSkeleton() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-base leading-normal font-medium">
          <Skeleton className="h-6 w-48" />
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          <Skeleton className="h-5 w-80" />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <div className="aspect-auto h-64 w-full">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}
