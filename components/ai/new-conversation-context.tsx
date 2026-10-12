'use client';

import { createContext, useContext, useMemo, useState } from 'react';

export interface NewConversation {
  id: string;
  title: string;
}

interface NewConversationValue {
  created: NewConversation | null;
  announce: (conversation: NewConversation) => void;
}

const NewConversationContext = createContext<NewConversationValue | null>(null);

/** Shares the Conversation that just got its id (the `data-conversation` part) between the chat island and the list. */
export function NewConversationProvider({ children }: { children: React.ReactNode }) {
  const [created, setCreated] = useState<NewConversation | null>(null);
  const value = useMemo(() => ({ created, announce: setCreated }), [created]);
  return <NewConversationContext.Provider value={value}>{children}</NewConversationContext.Provider>;
}

/** Null outside a provider, so islands and lists still render on their own. */
export function useNewConversation(): NewConversationValue | null {
  return useContext(NewConversationContext);
}
