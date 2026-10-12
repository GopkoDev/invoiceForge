import { DraftCard } from '@/components/ai/draft-card';
import { ConversationHeaderClient } from '@/components/ai/conversation-header-client';
import { MessageList } from '@/components/ai/message-list';
import { unwrapPageResult } from '@/components/layout/content-area';
import { Skeleton } from '@/components/ui/skeleton';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { getConversation } from '@/lib/services/conversations';

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;
  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const { conversation, messages, invoiceLinks, cards } = unwrapPageResult(await getConversation(actor, conversationId));

  return (
    <div className="flex flex-col gap-4">
      <ConversationHeaderClient title={conversation.title} />
      <MessageList
        messages={messages}
        invoiceLinks={invoiceLinks}
        renderCard={(id) => (cards[id] ? <DraftCard card={cards[id]} /> : <Skeleton className="h-64 w-full" />)}
      />
    </div>
  );
}
