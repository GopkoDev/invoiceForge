import { ConversationListClient } from '@/components/ai/conversation-list-client';
import type { ConversationPage } from '@/components/ai/conversation-list';
import { NewConversationProvider } from '@/components/ai/new-conversation-context';

/** SCR-01 / SCR-02 two-pane layout: the chat first in the DOM (phones), the list column first at lg. */
export function AiWorkspace({
  conversations,
  timeZone,
  children,
}: {
  conversations: ConversationPage;
  timeZone: string;
  children: React.ReactNode;
}) {
  return (
    <NewConversationProvider>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <section className="min-w-0">{children}</section>
        <aside className="min-w-0 lg:order-first">
          <ConversationListClient conversations={conversations} timeZone={timeZone} />
        </aside>
      </div>
    </NewConversationProvider>
  );
}
