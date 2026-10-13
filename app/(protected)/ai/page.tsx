import { ChatIsland } from '@/components/ai/chat-island';
import { AiWorkspace } from '@/components/ai/ai-workspace';
import { startPointFromAddress } from '@/components/ai/start-point';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { getAllowanceState } from '@/lib/services/assistant-usage';
import { listConversationSummaries } from '@/lib/services/conversations';

interface AiPageProps {
  searchParams: Promise<{ start?: string | string[]; from?: string | string[] }>;
}

export default async function AiPage({ searchParams }: AiPageProps) {
  // ai-chat-v2 T20: the start point the first message is sent with comes from the address.
  const { start, startedFrom } = startPointFromAddress(await searchParams);

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
        startedFrom={startedFrom}
      />
    </AiWorkspace>
  );
}
