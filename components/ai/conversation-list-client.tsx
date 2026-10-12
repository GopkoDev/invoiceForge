'use client';

import { useRouter } from 'next/navigation';
import {
  ConversationList,
  type ConversationPage,
} from '@/components/ai/conversation-list';
import { useDeleteConversations } from '@/components/ai/use-delete-conversations';

// A function prop cannot cross the server-to-client boundary, so the page renders this wrapper,
// which owns onDelete and opens the SCR-04 dialog.
export function ConversationListClient(props: {
  conversations: ConversationPage;
  timeZone: string;
}) {
  const router = useRouter();
  const { deleteOne, deleteAll } = useDeleteConversations({ onGone: () => router.refresh() });

  return (
    <ConversationList
      {...props}
      onDelete={(target) =>
        target.kind === 'all'
          ? deleteAll(props.conversations.total)
          : deleteOne(target.id, target.title)
      }
    />
  );
}
