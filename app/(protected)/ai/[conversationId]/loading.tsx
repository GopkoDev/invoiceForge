import { Skeleton } from '@/components/ui/skeleton';

// SCR-03 loading (ai-chat-v2 T67, AC-51): the chat pane only; the Conversation list stays from ai/layout.tsx. Built
// from the real boxes: the h-12 header, the max-w-3xl px-4 column with an assistant row (size-6 avatar, items-start
// gap-3) and a user bubble, and the composer placeholder at the real Composer's min height.
export default function ConversationLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b px-2 md:px-4">
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-hidden px-4 py-4">
        <Skeleton className="h-11 w-1/2 self-end rounded-2xl" />
        <div className="flex w-full items-start gap-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-11 w-1/2 self-end rounded-2xl" />
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <Skeleton className="min-h-[7.25rem] w-full rounded-2xl" />
      </div>
    </div>
  );
}
