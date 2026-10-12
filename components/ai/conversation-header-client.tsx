'use client';

import { ConversationHeader } from '@/components/ai/conversation-header';

// A function prop cannot cross the server-to-client boundary, so the page renders this wrapper,
// which owns onDelete. T30 connects it to the delete dialog; until then it does nothing.
export function ConversationHeaderClient({ title }: { title: string }) {
  return <ConversationHeader title={title} onDelete={() => {}} />;
}
