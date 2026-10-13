'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { PanelLeftIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { ConversationListClient } from '@/components/ai/conversation-list-client';
import { InvoicePreviewPanel } from '@/components/ai/invoice-preview-panel';
import { InvoiceStateProvider } from '@/components/ai/invoice-state-context';
import { closePreview, PREVIEW_PARAM } from '@/components/ai/preview-address';
import { useMediaQuery } from '@/components/ai/use-media-query';
import { NewConversationProvider } from '@/components/ai/new-conversation-context';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { ConversationSummary } from '@/types/assistant/types';
import { cn } from '@/lib/utils';

const ListSheetContext = createContext<{ openList: () => void; previewOpen: boolean } | null>(null);

/**
 * The header's list button (SCR-01 phone sheet): below md it opens the Conversation list as a left Sheet; with a
 * preview open it stays up to xl, where the list pane gives way to the preview (screens.md §SCR-06 md–xl layout).
 * Renders nothing outside an AiWorkspace.
 */
export function ConversationListButton({ className }: { className?: string }) {
  const ctx = useContext(ListSheetContext);
  if (!ctx) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Open conversations"
      className={cn('shrink-0', ctx.previewOpen ? 'xl:hidden' : 'md:hidden', className)}
      onClick={ctx.openList}
    >
      <PanelLeftIcon className="size-4" />
    </Button>
  );
}

/**
 * ai-chat-v2 T19 (sad.md §5 "Full-height workspace"; screens.md §Layout and breakpoints; AC-15, AC-19): the AI
 * section's grid. It fills the viewport-height shell of `/ai/layout.tsx`; every pane is `min-h-0` and scrolls on its
 * own, so the page never scrolls. From md (768 px) the list pane (18rem) sits before the chat in DOM and visual
 * order; below md the same list opens as a left Sheet from ConversationListButton and closes on a pick, ×, Escape
 * or the overlay. Wraps the children in NewConversationProvider and the invoice-state store (ADR-0008).
 */
export function AiWorkspace({
  conversations,
  timeZone,
  children,
}: {
  conversations: ConversationSummary[];
  timeZone: string;
  children: React.ReactNode;
}) {
  const [listOpen, setListOpen] = useState(false);
  // ai-chat-v2 T24 (ADR-0005): an open preview is ?preview={cardId}; a column from md, a full-screen sheet below.
  const previewCardId = useSearchParams()?.get(PREVIEW_PARAM) ?? null;
  const previewOpen = previewCardId !== null;
  const desktop = useMediaQuery('(min-width: 768px)', true);
  const sheet = useMemo(() => ({ openList: () => setListOpen(true), previewOpen }), [previewOpen]);

  return (
    <NewConversationProvider>
      <InvoiceStateProvider>
      <ListSheetContext.Provider value={sheet}>
        <div
          data-slot="ai-workspace"
          data-preview={previewOpen ? 'open' : 'closed'}
          className={cn(
            'grid h-full min-h-0 grid-cols-1',
            previewOpen
              ? 'md:grid-cols-[minmax(0,1fr)_minmax(20rem,50%)] xl:grid-cols-[18rem_minmax(0,1fr)_minmax(26rem,40%)]'
              : 'md:grid-cols-[18rem_minmax(0,1fr)]'
          )}
        >
          <aside
            aria-label="Conversation list"
            className={cn(
              'hidden min-h-0 min-w-0 border-r',
              previewOpen ? 'xl:flex xl:flex-col' : 'md:flex md:flex-col'
            )}
          >
            <ConversationListClient conversations={conversations} timeZone={timeZone} />
          </aside>
          <section className="flex min-h-0 min-w-0 flex-col p-2 md:p-4">{children}</section>
          {previewCardId && desktop ? (
            <div data-slot="preview-column" className="hidden min-h-0 min-w-0 md:flex md:flex-col">
              <InvoicePreviewPanel key={previewCardId} cardId={previewCardId} />
            </div>
          ) : null}
        </div>
        <Sheet open={previewCardId !== null && !desktop} onOpenChange={(open) => (open ? undefined : closePreview())}>
          <SheetContent side="bottom" showCloseButton={false} className="h-dvh gap-0 p-0 md:hidden">
            <SheetTitle className="sr-only">Invoice preview</SheetTitle>
            {previewCardId && !desktop ? (
              <InvoicePreviewPanel key={previewCardId} cardId={previewCardId} variant="sheet" />
            ) : null}
          </SheetContent>
        </Sheet>
        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetContent
            side="left"
            className={cn('w-[min(20rem,85vw)] gap-0 p-0', previewOpen ? 'xl:hidden' : 'md:hidden')}
          >
            <SheetTitle className="sr-only">Conversations</SheetTitle>
            <ConversationListClient conversations={conversations} timeZone={timeZone} onPick={() => setListOpen(false)} />
          </SheetContent>
        </Sheet>
      </ListSheetContext.Provider>
      </InvoiceStateProvider>
    </NewConversationProvider>
  );
}
