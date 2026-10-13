import { Skeleton } from '@/components/ui/skeleton';

// SCR-03 loading (presentation per ai-chat-v2 T35, review R16-1 / T42): the same full-height workspace container as
// /ai/loading.tsx (list pane with the search row, two group labels and six plain rows), then the chat pane's h-12
// header, alternating message skeletons in the centred column and a composer docked at the bottom.
export default function ConversationLoading() {
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
      <div className="flex min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center border-b px-2 md:px-4">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden p-4">
          <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
          <Skeleton className="h-24 w-3/4" />
          <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
        </div>
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
