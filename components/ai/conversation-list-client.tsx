'use client';

import {
  ConversationList,
  type ConversationPage,
} from '@/components/ai/conversation-list';

// A function prop cannot cross the server-to-client boundary, so the page renders this wrapper,
// which owns onDelete. T30 connects it to the delete dialog; until then it does nothing.
export function ConversationListClient(props: {
  conversations: ConversationPage;
  timeZone: string;
}) {
  return <ConversationList {...props} onDelete={() => {}} />;
}
