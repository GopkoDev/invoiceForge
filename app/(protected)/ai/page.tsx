import { ChatIsland } from '@/components/ai/chat-island';
import { AiWorkspace } from '@/components/ai/ai-workspace';
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
    <AiWorkspace conversations={conversations} timeZone={actor.timeZone} phoneList>
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
        start={start}
      />
    </AiWorkspace>
  );
}
