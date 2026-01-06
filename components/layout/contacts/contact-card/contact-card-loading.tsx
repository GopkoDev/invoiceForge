import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function ContactCardLoading() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4 overflow-hidden">
          <Skeleton className="h-12 w-12 rounded-full" />

          <div className="flex-1 min-w-0 space-y-1">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4.5 w-40" />
          </div>

          <Skeleton className="h-6.5 w-14 rounded-full" />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <Separator />

        <div className="space-y-2 text-sm min-h-[104px]">
          {[1, 2, 3, 4].map((i) => (
            <div key={`contact-info-${i}`} className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-4 w-full max-w-[180px]" />
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-3.5 w-20" />
        </div>

        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-9" />
        </div>
      </CardContent>
    </Card>
  );
}
