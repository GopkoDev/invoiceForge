'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { ConversationSummary } from '@/types/assistant/types';

interface ConversationListValue {
  conversations: ConversationSummary[];
  timeZone: string;
  /** A Conversation was just saved by its first reply: it heads the list (once per id). */
  conversationCreated: (summary: ConversationSummary) => void;
  /** A turn was saved: the Conversation moves to the top with its new last-activity time (and maybe a new title). */
  conversationTouched: (
    id: string,
    lastMessageAt: string,
    title?: string
  ) => void;
  conversationRenamed: (id: string, title: string) => void;
  conversationsDeleted: (ids: string[]) => void;
}

const ConversationListContext = createContext<ConversationListValue | null>(
  null
);

/**
 * ai-chat-v2 T66 (ADR-0013): the Conversation list the AI layout owns. Seeded by the layout's one read and changed
 * only by the four list events; a new `conversations` prop (a layout re-render) replaces the state, reconciling by id.
 */
export function ConversationListProvider({
  conversations: initial,
  timeZone,
  children,
}: {
  conversations: ConversationSummary[];
  timeZone: string;
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState(initial);
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setConversations(initial);
  }

  const value = useMemo<ConversationListValue>(
    () => ({
      conversations,
      timeZone,
      conversationCreated: (summary) =>
        setConversations((current) => [
          summary,
          ...current.filter((c) => c.id !== summary.id),
        ]),
      conversationTouched: (id, lastMessageAt, title) =>
        setConversations((current) => {
          const row = current.find((c) => c.id === id);
          if (!row) return current;
          return [
            { ...row, lastMessageAt, title: title ?? row.title },
            ...current.filter((c) => c.id !== id),
          ];
        }),
      conversationRenamed: (id, title) =>
        setConversations((current) =>
          current.map((c) => (c.id === id ? { ...c, title } : c))
        ),
      conversationsDeleted: (ids) =>
        setConversations((current) =>
          current.filter((c) => !ids.includes(c.id))
        ),
    }),
    [conversations, timeZone]
  );

  return (
    <ConversationListContext.Provider value={value}>
      {children}
    </ConversationListContext.Provider>
  );
}

export function useConversationList(): ConversationListValue {
  const value = useContext(ConversationListContext);
  if (!value)
    throw new Error('useConversationList needs a ConversationListProvider');
  return value;
}

/** Null outside a provider, so islands and headers still render on their own. */
export function useOptionalConversationList(): ConversationListValue | null {
  return useContext(ConversationListContext);
}
