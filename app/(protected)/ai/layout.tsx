import { AiWorkspace } from '@/components/ai/ai-workspace';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { listConversationSummaries } from '@/lib/services/conversations';
import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';

// ai-chat-v2 T19 (sad.md §5 "Full-height workspace"; AC-15): the AI section fills the viewport below the app header
// instead of the scrolling ContentArea; its panes scroll on their own and the page never does. The inset sidebar
// variant adds a 0.5rem margin above and below the content from md. While the cookie banner shows, its height
// (--cookie-banner-height, components/layout/cookie-banner.tsx) is left free so it never covers the docked composer.
// ai-chat-v2 T35 (screens.md «Workspace container»): from md, 16 px of padding inside that height around the
// workspace's rounded bordered container (AiWorkspace); below md the workspace is edge to edge.
// ai-chat-v2 T66 (ADR-0013): the layout reads the Conversation list once; the list pane stays mounted across /ai and
// /ai/{id}, so picking a Conversation changes only the chat pane (the pages render the header and the island).
export default async function AiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const summaries = unwrapPageResult(await listConversationSummaries(actor));

  return (
    <>
      <div className="h-[calc(100dvh-var(--header-height)-var(--cookie-banner-height,0px))] overflow-hidden md:h-[calc(100dvh-var(--header-height)-1rem-var(--cookie-banner-height,0px))] md:p-4">
        <AiWorkspace
          conversations={summaries.items}
          timeZone={summaries.timeZone}
        >
          {children}
        </AiWorkspace>
      </div>

      <AiModalContainer />
    </>
  );
}
