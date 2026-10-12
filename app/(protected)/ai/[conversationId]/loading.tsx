import { Skeleton } from '@/components/ui/skeleton';

export default function ConversationLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-16 w-2/3 self-end" />
      <Skeleton className="h-24 w-3/4" />
      <Skeleton className="h-16 w-2/3 self-end" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
