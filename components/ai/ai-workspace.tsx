import { ConversationListClient } from '@/components/ai/conversation-list-client';
import type { ConversationPage } from '@/components/ai/conversation-list';
import { NewConversationProvider } from '@/components/ai/new-conversation-context';

/**
 * SCR-01 / SCR-02 two-pane layout. The list is rendered in two slots so the DOM order matches the
 * visual order at every breakpoint (no CSS reordering): `hidden lg:block` before the chat (lg and up)
 * and, on /ai only, `lg:hidden` after it (phones). display:none keeps only one slot in the a11y tree
 * and tab order per breakpoint. /ai/{id} shows the Conversation alone below lg.
 */
export function AiWorkspace({
  conversations,
  timeZone,
  phoneList = false,
  children,
}: {
  conversations: ConversationPage;
  timeZone: string;
  /** Render the list below the chat on phones (the /ai start screen). */
  phoneList?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NewConversationProvider>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="hidden min-w-0 lg:block">
          <ConversationListClient conversations={conversations} timeZone={timeZone} />
        </aside>
        <section className="min-w-0">{children}</section>
        {phoneList ? (
          <aside className="min-w-0 lg:hidden">
            <ConversationListClient conversations={conversations} timeZone={timeZone} />
          </aside>
        ) : null}
      </div>
    </NewConversationProvider>
  );
}
