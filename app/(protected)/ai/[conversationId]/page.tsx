import { ConversationHeaderClient } from '@/components/ai/conversation-header-client';
import { MessageList } from '@/components/ai/message-list';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { getConversation } from '@/lib/services/conversations';

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;
  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const { conversation, messages, invoiceLinks } = unwrapPageResult(await getConversation(actor, conversationId));

  return (
    <div className="flex flex-col gap-4">
      <ConversationHeaderClient title={conversation.title} />
      <MessageList messages={messages} invoiceLinks={invoiceLinks} />
    </div>
  );
}
