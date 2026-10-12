'use client';

import { useRouter } from 'next/navigation';
import {
  ConversationList,
  type ConversationPage,
} from '@/components/ai/conversation-list';
import { useNewConversation } from '@/components/ai/new-conversation-context';
import { useDeleteConversations } from '@/components/ai/use-delete-conversations';

// A function prop cannot cross the server-to-client boundary, so the page renders this wrapper,
// which owns onDelete and opens the SCR-04 dialog.
export function ConversationListClient(props: {
  conversations: ConversationPage;
  timeZone: string;
}) {
  const router = useRouter();
  const { deleteOne, deleteAll } = useDeleteConversations({ onGone: () => router.refresh() });

  const created = useNewConversation()?.created;
  // The Conversation just started in the island heads the list until the server list includes it.
  const { conversations } = props;
  const listed =
    created && !conversations.items.some((c) => c.id === created.id)
      ? {
          ...conversations,
          items: [{ id: created.id, title: created.title, lastMessageAt: new Date().toISOString() }, ...conversations.items],
          total: conversations.total + 1,
        }
      : conversations;

  return (
    <ConversationList
      {...props}
      conversations={listed}
      onDelete={(target) =>
        target.kind === 'all'
          ? deleteAll(listed.total)
          : deleteOne(target.id, target.title)
      }
    />
  );
}
