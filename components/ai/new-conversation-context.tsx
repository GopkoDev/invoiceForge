'use client';

import { createContext, useContext, useMemo, useState } from 'react';

export interface NewConversation {
  id: string;
  title: string;
}

interface NewConversationValue {
  created: NewConversation | null;
  announce: (conversation: NewConversation) => void;
  /** After a delete: drop the announced Conversation when it is `id`, or whatever it is for `all`. */
  forget: (target: { kind: 'one'; id: string } | { kind: 'all' }) => void;
}

const NewConversationContext = createContext<NewConversationValue | null>(null);

/** Shares the Conversation that just got its id (the `data-conversation` part) between the chat island and the list. */
export function NewConversationProvider({ children }: { children: React.ReactNode }) {
  const [created, setCreated] = useState<NewConversation | null>(null);
  const value = useMemo(
    () => ({
      created,
      announce: setCreated,
      forget: (target: { kind: 'one'; id: string } | { kind: 'all' }) =>
        setCreated((current) => (current && (target.kind === 'all' || target.id === current.id) ? null : current)),
    }),
    [created]
  );
  return <NewConversationContext.Provider value={value}>{children}</NewConversationContext.Provider>;
}

/** Null outside a provider, so islands and lists still render on their own. */
export function useNewConversation(): NewConversationValue | null {
  return useContext(NewConversationContext);
}
