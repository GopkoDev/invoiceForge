import { Skeleton } from '@/components/ui/skeleton';

// SCR-02 loading (ai-chat-v2 T67, AC-51): the /ai chat pane only; the Conversation list stays from ai/layout.tsx.
// The composer placeholder has the real Composer's min height (7.25rem) inside the real max-w-3xl px-4 pb-4 dock.
export default function AiLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-8 w-96 max-w-full" />
      <div className="w-full max-w-3xl">
        <Skeleton className="min-h-[7.25rem] w-full rounded-2xl" />
      </div>
    </div>
  );
}
