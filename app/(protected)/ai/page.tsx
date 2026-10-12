import { ConversationListClient } from '@/components/ai/conversation-list-client';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { listConversations } from '@/lib/services/conversations';

interface AiPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

export default async function AiPage({ searchParams }: AiPageProps) {
  const { page: rawPage } = await searchParams;
  const parsed = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const page = Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;

  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const conversations = unwrapPageResult(await listConversations(actor, page));

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="min-w-0 lg:order-first">
        <ConversationListClient conversations={conversations} timeZone={actor.timeZone} />
      </aside>
    </div>
  );
}
