import { AiWorkspace } from '@/components/ai/ai-workspace';
import { ChatIsland } from '@/components/ai/chat-island';
import { ConversationHeaderClient } from '@/components/ai/conversation-header-client';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { getAllowanceState } from '@/lib/services/assistant-usage';
import { getConversation, listConversationSummaries } from '@/lib/services/conversations';

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;
  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const { conversation, messages, invoiceLinks, cards } = unwrapPageResult(await getConversation(actor, conversationId));

  const summaries = unwrapPageResult(await listConversationSummaries(actor));
  const allowance = unwrapPageResult(await getAllowanceState(actor));

  return (
    <AiWorkspace conversations={summaries.items} timeZone={summaries.timeZone}>
      <ConversationHeaderClient conversationId={conversationId} title={conversation.title} />
      <ChatIsland
        conversationId={conversationId}
        initialMessages={messages}
        invoiceLinks={invoiceLinks}
        cards={cards}
        allowance={allowance}
      />
    </AiWorkspace>
  );
}
