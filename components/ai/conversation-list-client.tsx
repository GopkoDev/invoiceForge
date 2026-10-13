'use client';

import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { useOptionalConversationList } from '@/components/ai/conversation-list-context';
import { ConversationList } from '@/components/ai/conversation-list';
import { protectedRoutes } from '@/config/routes.config';
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
  const openId = useSelectedLayoutSegment();
  const layoutList = useOptionalConversationList();
  const newConversation = useNewConversation();
  // SCR-01 "deleted": when the open Conversation is among the deleted, leave for /ai; otherwise refresh the list.
  const { deleteOne, deleteAll } = useDeleteConversations({
    onGone: (target) => {
      const openGone =
        openId !== null && (target.kind === 'all' || target.id === openId);
      // ADR-0013: the delete hook removed the rows from the layout's list; only leaving an open Conversation is left.
      if (openGone) router.push(protectedRoutes.ai);
      // Outside the layout's provider nobody holds the rows: re-read them.
      else if (!layoutList) router.refresh();
    },
  });

  const created = newConversation?.created;
  // The Conversation just started in the island heads the list (in Today) until the server list includes it.
  const { conversations } = props;
  const listed =
    created && !conversations.some((c) => c.id === created.id)
      ? [
          {
            id: created.id,
            title: created.title,
            lastMessageAt: new Date().toISOString(),
          },
          ...conversations,
        ]
      : conversations;

  return (
    <ConversationList
      {...props}
      conversations={listed}
      onDelete={(target) =>
        target.kind === 'all'
          ? deleteAll(listed.length)
          : deleteOne(target.id, target.title)
      }
    />
  );
}
