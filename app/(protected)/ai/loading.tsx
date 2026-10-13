import { Skeleton } from '@/components/ui/skeleton';

// SCR-01 / SCR-02 loading (presentation per ai-chat-v2 T35): the full-height workspace container with the list
// pane's search row, two group labels and six plain rows, and a centred greeting and composer in the chat pane.
export default function AiLoading() {
  return (
    <div className="bg-background grid h-full min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[16rem_minmax(0,1fr)] md:rounded-xl md:border">
      <div className="hidden min-h-0 flex-col border-r md:flex">
        <div className="border-b p-2">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex flex-col gap-1 px-2">
          <Skeleton className="mx-3 mt-4 mb-1 h-3 w-12" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={`a${i}`} className="h-9 w-full" />
          ))}
          <Skeleton className="mx-3 mt-4 mb-1 h-3 w-20" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={`b${i}`} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-col items-center justify-center gap-4 p-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-28 w-full max-w-3xl rounded-2xl" />
      </div>
    </div>
  );
}
