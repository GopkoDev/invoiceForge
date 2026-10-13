import type { ReactNode } from 'react';
import { ChatLink } from '@/components/ai/chat-link';
import { cn } from '@/lib/utils';
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

// Message text is always plain text with line breaks kept: never Markdown, HTML or an anchor
// (AC-07). Links come only from data-link parts; cards from data-draft-card parts.
export function MessageList({
  messages,
  invoiceLinks,
  renderCard,
  renderOffer,
}: MessageListProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => {
        const isUser = m.role === 'user';
        return (
          <div
            key={m.id}
            data-role={m.role}
            className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'flex max-w-[85%] min-w-0 flex-col gap-2 rounded-lg px-3 py-2',
                isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              {m.parts.map((part, i) => {
                if (part.type === 'text') {
                  return (
                    <p
                      key={i}
                      className="text-sm break-words whitespace-pre-wrap"
                    >
                      {part.text}
                    </p>
                  );
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
                  return <div key={i}>{renderOffer?.(part.data.offerId, m.id)}</div>;
                }
                return null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
