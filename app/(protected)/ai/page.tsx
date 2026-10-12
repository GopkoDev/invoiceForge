import { ChatIsland } from '@/components/ai/chat-island';
import { ConversationListClient } from '@/components/ai/conversation-list-client';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { getAllowanceState } from '@/lib/services/assistant-usage';
import { listConversations } from '@/lib/services/conversations';

interface AiPageProps {
  searchParams: Promise<{ page?: string | string[]; start?: string | string[] }>;
}

export default async function AiPage({ searchParams }: AiPageProps) {
  const { page: rawPage, start: rawStart } = await searchParams;
  const parsed = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const page = Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;

  const start = (Array.isArray(rawStart) ? rawStart[0] : rawStart) === 'draft' ? 'draft' : undefined;

  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const conversations = unwrapPageResult(await listConversations(actor, page));
  const allowance = unwrapPageResult(await getAllowanceState(actor));

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="min-w-0 lg:order-first">
        <ConversationListClient conversations={conversations} timeZone={actor.timeZone} />
      </aside>
      <section className="min-w-0">
        <ChatIsland
          conversationId={null}
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance}
          start={start}
        />
      </section>
    </div>
  );
}
