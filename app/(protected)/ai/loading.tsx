import { Skeleton } from '@/components/ui/skeleton';

export default function AiLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
