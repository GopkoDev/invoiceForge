import type { ReactNode } from 'react';

import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { ChatLink } from '@/components/ai/chat-link';
import type {
  ConversationMessageView,
  LinkedInvoiceState,
} from '@/types/assistant/types';

interface MessageListProps {
  messages: ConversationMessageView[];
  invoiceLinks: Record<string, LinkedInvoiceState>;
  renderCard?: (cardId: string) => ReactNode;
  /** ai-chat-v2 T22: renders a reply's Offered choices (SCR-04) for a data-offer part. */
  renderOffer?: (offerId: string, messageId: string) => ReactNode;
}

/**
 * The messages of a Conversation, composed from the chat elements (ai-chat-v2 T36, ADR-0010): a Freelancer message is
 * a right-aligned secondary bubble; a reply is the avatar and plain text, followed by its links, Offered choices and
 * Draft cards in part order inside the same content column.
 *
 * Message text is always plain text with line breaks kept: never Markdown, HTML or an anchor (AC-07). Links come only
 * from data-link parts; cards from data-draft-card parts.
 */
export function MessageList({
  messages,
  invoiceLinks,
  renderCard,
  renderOffer,
}: MessageListProps) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((m) => (
        <Message key={m.id} from={m.role}>
          {m.role === 'assistant' ? <MessageAvatar /> : null}
          <MessageContent>
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                return <MessageResponse key={i}>{part.text}</MessageResponse>;
              }
              if (part.type === 'data-link') {
                const state =
                  part.data.kind === 'invoice'
                    ? invoiceLinks[part.data.invoiceId]
                    : undefined;
                return (
                  <div key={i}>
                    <ChatLink link={part.data} state={state} />
                  </div>
                );
              }
              if (part.type === 'data-draft-card') {
                return <div key={i}>{renderCard?.(part.data.cardId)}</div>;
              }
              if (part.type === 'data-offer') {
                return (
                  <div key={i}>{renderOffer?.(part.data.offerId, m.id)}</div>
                );
              }
              return null;
            })}
          </MessageContent>
        </Message>
      ))}
    </div>
  );
}
