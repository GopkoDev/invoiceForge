'use client';

import { useRouter } from 'next/navigation';
import { ConversationList } from '@/components/ai/conversation-list';
import { useNewConversation } from '@/components/ai/new-conversation-context';
import { useDeleteConversations } from '@/components/ai/use-delete-conversations';
import type { ConversationSummary } from '@/types/assistant/types';

// A function prop cannot cross the server-to-client boundary, so the page renders this wrapper,
// which owns onDelete and opens the SCR-04 dialog.
export function ConversationListClient(props: {
  conversations: ConversationSummary[];
  timeZone: string;
  onPick?: () => void;
}) {
  const router = useRouter();
  const { deleteOne, deleteAll } = useDeleteConversations({ onGone: () => router.refresh() });

  const created = useNewConversation()?.created;
  // The Conversation just started in the island heads the list (in Today) until the server list includes it.
  const { conversations } = props;
  const listed =
    created && !conversations.some((c) => c.id === created.id)
      ? [{ id: created.id, title: created.title, lastMessageAt: new Date().toISOString() }, ...conversations]
      : conversations;

  return (
    <ConversationList
      {...props}
      conversations={listed}
      onDelete={(target) => (target.kind === 'all' ? deleteAll(listed.length) : deleteOne(target.id, target.title))}
    />
  );
}
