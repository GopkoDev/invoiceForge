'use client';

import { useRouter } from 'next/navigation';
import { ConversationHeader } from '@/components/ai/conversation-header';
import { useDeleteConversations } from '@/components/ai/use-delete-conversations';
import { protectedRoutes } from '@/config/routes.config';

// A function prop cannot cross the server-to-client boundary, so the page renders this wrapper,
// which owns onDelete and opens the SCR-04 dialog.
export function ConversationHeaderClient({
  conversationId,
  title,
}: {
  conversationId: string;
  title: string;
}) {
  const router = useRouter();
  const { deleteOne } = useDeleteConversations({
    onGone: () => router.push(protectedRoutes.ai),
  });

  return <ConversationHeader title={title} onDelete={() => deleteOne(conversationId, title)} />;
}
