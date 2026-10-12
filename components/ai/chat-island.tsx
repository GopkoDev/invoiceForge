'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, generateId, type UIMessage } from 'ai';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { Composer } from '@/components/ai/composer';
import { DraftCard } from '@/components/ai/draft-card';
import { MessageList } from '@/components/ai/message-list';
import { StartPanel } from '@/components/ai/start-panel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { protectedRoutes } from '@/config/routes.config';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import type { AllowanceState, AppLink } from '@/lib/validations/assistant-chat';
import type { ConversationMessageView, DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';

const COULD_NOT_COMPLETE = "The reply couldn't be completed. Try again.";
const AI_UNAVAILABLE =
  'AI is temporarily unavailable. Try again in a few minutes. The rest of Invoice Forge works as usual.';
const CONVERSATION_GONE = "This conversation can't be found.";

type OutcomeName = 'ANSWERED' | 'PARTIAL' | 'COULD_NOT_COMPLETE' | 'AI_UNAVAILABLE';

type ChatMessage = UIMessage<
  unknown,
  {
    conversation: { conversationId: string; title: string };
    allowance: AllowanceState;
    'draft-card': { cardId: string };
    link: AppLink;
    outcome: { outcome: OutcomeName; counted: boolean };
  }
>;

type Failure =
  | { kind: 'COULD_NOT_COMPLETE' | 'AI_UNAVAILABLE'; userMessageId: string; text: string }
  | { kind: 'GONE' }
  | { kind: 'VALIDATION'; message: string };

class ChatHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; details?: unknown } | null
  ) {
    super(body?.error ?? `Request failed with ${status}`);
  }
}

// Turns a refusal into a typed error the island can read (the SDK would only keep the text).
async function chatFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ChatHttpError['body'];
    throw new ChatHttpError(response.status, body);
  }
  return response;
}

// Mutable bookkeeping the transport and the SDK callbacks read at send time. It lives outside
// the component so those callbacks always see the latest value, never a stale closure.
function createRequestState(initialConversationId: string | null) {
  let conversationId = initialConversationId;
  let pending: { id: string; text: string } | null = null;
  return {
    getConversationId: () => conversationId,
    setConversationId: (id: string) => {
      conversationId = id;
    },
    getPending: () => pending,
    setPending: (next: { id: string; text: string }) => {
      pending = next;
    },
  };
}

function toView(message: ChatMessage): ConversationMessageView {
  const parts: ConversationMessageView['parts'] = [];
  for (const part of message.parts) {
    if (part.type === 'text') {
      if (part.text) parts.push({ type: 'text', text: part.text });
    } else if (part.type === 'data-link') {
      parts.push({ type: 'data-link', data: part.data });
    } else if (part.type === 'data-draft-card') {
      parts.push({ type: 'data-draft-card', id: part.id ?? part.data.cardId, data: part.data });
    }
  }
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    parts,
    createdAt: '',
  };
}

export function ChatIsland({
  conversationId,
  initialMessages,
  invoiceLinks,
  cards,
  allowance: initialAllowance,
  start,
}: {
  conversationId: string | null;
  initialMessages: ConversationMessageView[];
  invoiceLinks: Record<string, LinkedInvoiceState>;
  cards: Record<string, DraftCardView>;
  allowance: AllowanceState;
  start?: 'draft';
}) {
  const router = useRouter();
  // Mutable request bookkeeping read by the transport and SDK callbacks, never during render.
  const [live] = useState(() => createRequestState(conversationId));
  const [allowance, setAllowance] = useState(initialAllowance);
  const [usedUpMessage, setUsedUpMessage] = useState<string>();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [started, setStarted] = useState(false);
  const [text, setText] = useState('');
  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        fetch: chatFetch,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { conversationId: live.getConversationId(), message: messages[messages.length - 1] },
        }),
      })
  );

  const { messages, setMessages, sendMessage, status } = useChat<ChatMessage>({
    transport,
    messages: initialMessages.map((m) => ({ id: m.id, role: m.role, parts: m.parts }) as ChatMessage),
    onData: (part) => {
      if (part.type === 'data-conversation') {
        live.setConversationId(part.data.conversationId);
        window.history.replaceState(window.history.state, '', `/ai/${part.data.conversationId}`);
      } else if (part.type === 'data-allowance') {
        setAllowance(part.data);
      } else if (part.type === 'data-outcome') {
        const { outcome } = part.data;
        const sent = live.getPending();
        if ((outcome === 'COULD_NOT_COMPLETE' || outcome === 'AI_UNAVAILABLE') && sent) {
          setFailure({ kind: outcome, userMessageId: sent.id, text: sent.text });
        }
      }
    },
    onError: (error) => {
      const sent = live.getPending();
      if (error instanceof ChatHttpError) {
        if (error.status === 401) {
          goToSignIn();
          return;
        }
        if (error.status === 429) {
          if (sent) setMessages((current) => current.filter((m) => m.id !== sent.id));
          const details = error.body?.details as AllowanceState | undefined;
          setAllowance(details ?? { ...initialAllowance, used: initialAllowance.limit, left: 0 });
          setUsedUpMessage(error.message);
          return;
        }
        if (error.status === 404) {
          setFailure({ kind: 'GONE' });
          return;
        }
        if (error.status === 400) {
          if (sent) {
            setMessages((current) => current.filter((m) => m.id !== sent.id));
            setText(sent.text);
          }
          setFailure({ kind: 'VALIDATION', message: error.message });
          return;
        }
      }
      if (sent) setFailure({ kind: 'COULD_NOT_COMPLETE', userMessageId: sent.id, text: sent.text });
    },
    onFinish: () => router.refresh(),
  });

  const inFlight = status === 'submitted' || status === 'streaming';

  function send(raw: string) {
    const id = generateId();
    live.setPending({ id, text: raw });
    setFailure(null);
    setStarted(true);
    setText('');
    void sendMessage({ id, role: 'user', parts: [{ type: 'text', text: raw }] });
  }

  function tryAgain(failed: Extract<Failure, { userMessageId: string }>) {
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === failed.userMessageId);
      return index === -1 ? current : current.slice(0, index);
    });
    send(failed.text);
  }

  if (conversationId === null && !started) {
    return <StartPanel state={allowance} start={start} onSend={send} />;
  }

  // A failed reply is discarded whole: everything after the Freelancer's message is hidden.
  const failedIndex =
    failure && 'userMessageId' in failure ? messages.findIndex((m) => m.id === failure.userMessageId) : -1;
  const visible = (failedIndex === -1 ? messages : messages.slice(0, failedIndex + 1))
    .map(toView)
    .filter((m) => m.parts.length > 0);
  const last = visible[visible.length - 1];
  const waiting = inFlight && !(failedIndex !== -1) && last?.role !== 'assistant';

  return (
    <div className="flex flex-col gap-4">
      <MessageList
        messages={visible}
        invoiceLinks={invoiceLinks}
        renderCard={(id) => (cards[id] ? <DraftCard card={cards[id]} /> : <Skeleton className="h-64 w-full" />)}
      />
      {waiting ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner aria-hidden role="presentation" />
          <span>Thinking…</span>
          <span role="status" className="sr-only">
            Assistant is replying…
          </span>
        </div>
      ) : null}
      {failure && 'userMessageId' in failure ? (
        <Alert variant="destructive">
          <AlertDescription>
            {failure.kind === 'AI_UNAVAILABLE' ? AI_UNAVAILABLE : COULD_NOT_COMPLETE}
          </AlertDescription>
          <div className="mt-2">
            <Button type="button" variant="outline" onClick={() => tryAgain(failure)}>
              Try again
            </Button>
          </div>
        </Alert>
      ) : null}
      {failure?.kind === 'GONE' ? (
        <Alert variant="destructive">
          <AlertDescription>{CONVERSATION_GONE}</AlertDescription>
          <div className="mt-2">
            <Link href={protectedRoutes.ai} className={buttonVariants({ variant: 'outline' })}>
              Start a new conversation →
            </Link>
          </div>
        </Alert>
      ) : null}
      {allowance.left === 0 ? (
        <AllowanceNotice state={allowance} usedUpMessage={usedUpMessage} handMadeLink={start === 'draft'} />
      ) : (
        <Composer
          value={text}
          onChange={(value) => {
            setText(value);
            if (failure?.kind === 'VALIDATION') setFailure(null);
          }}
          onSend={send}
          allowance={allowance}
          busy={inFlight}
          disabled={failure?.kind === 'GONE'}
          serverError={failure?.kind === 'VALIDATION' ? failure.message : undefined}
        />
      )}
    </div>
  );
}
