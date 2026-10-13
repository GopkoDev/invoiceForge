import { Skeleton } from '@/components/ui/skeleton';

// SCR-03 loading, as the full-height grid: the list pane's rows, then alternating message skeletons and a composer
// docked at the bottom of the chat pane.
export default function ConversationLoading() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="hidden min-h-0 flex-col gap-2 border-r p-3 md:flex">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <div className="flex min-h-0 flex-col gap-4 p-2 md:p-4">
        <Skeleton className="h-8 w-1/2" />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <Skeleton className="h-16 w-2/3 self-end" />
          <Skeleton className="h-24 w-3/4" />
          <Skeleton className="h-16 w-2/3 self-end" />
        </div>
        <Skeleton className="h-20 w-full shrink-0" />
      </div>
    </div>
  );
}
