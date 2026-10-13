import { ChatIsland } from '@/components/ai/chat-island';
import { AiWorkspace } from '@/components/ai/ai-workspace';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { getAllowanceState } from '@/lib/services/assistant-usage';
import { listConversationSummaries } from '@/lib/services/conversations';

interface AiPageProps {
  searchParams: Promise<{ start?: string | string[] }>;
}

export default async function AiPage({ searchParams }: AiPageProps) {
  const { start: rawStart } = await searchParams;
  const start = (Array.isArray(rawStart) ? rawStart[0] : rawStart) === 'draft' ? 'draft' : undefined;

  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const summaries = unwrapPageResult(await listConversationSummaries(actor));
  const allowance = unwrapPageResult(await getAllowanceState(actor));

  return (
    <AiWorkspace conversations={summaries.items} timeZone={summaries.timeZone}>
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
