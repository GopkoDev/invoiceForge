import { Skeleton } from '@/components/ui/skeleton';

// SCR-01 / SCR-02 loading: the full-height grid with the list pane's search, two group headings and six rows, and a
// centred greeting and composer in the chat pane.
export default function AiLoading() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="hidden min-h-0 flex-col gap-2 border-r p-3 md:flex">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="mt-2 h-3 w-16" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={`a${i}`} className="h-14 w-full" />
        ))}
        <Skeleton className="mt-2 h-3 w-20" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={`b${i}`} className="h-14 w-full" />
        ))}
      </div>
      <div className="flex min-h-0 flex-col items-center justify-center gap-4 p-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-28 w-full max-w-2xl" />
      </div>
    </div>
  );
}
