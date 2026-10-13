'use client';

import '@/components/ai/zod-csp-safe';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, generateId, type UIMessage } from 'ai';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { Composer } from '@/components/ai/composer';
import { ConversationListButton } from '@/components/ai/ai-workspace';
import { ConversationHeaderClient } from '@/components/ai/conversation-header-client';
import { useNewConversation } from '@/components/ai/new-conversation-context';
import { DraftCard } from '@/components/ai/draft-card';
import { MessageList } from '@/components/ai/message-list';
import { StartPanel } from '@/components/ai/start-panel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { protectedRoutes } from '@/config/routes.config';
import { loadConversationCards } from '@/lib/actions/assistant-actions';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import type { AllowanceState, AppLink } from '@/lib/validations/assistant-chat';
import type {
  ConversationMessageView,
  ConversationStartPoint,
  DraftCardView,
  LinkedInvoiceState,
} from '@/types/assistant/types';

const COULD_NOT_COMPLETE = "The reply couldn't be completed. Try again.";
const AI_UNAVAILABLE =
  'AI is temporarily unavailable. Try again in a few minutes. The rest of Invoice Forge works as usual.';
const CONVERSATION_GONE = "This conversation can't be found.";

type OutcomeName =
  | 'ANSWERED'
  | 'PARTIAL'
  | 'COULD_NOT_COMPLETE'
  | 'AI_UNAVAILABLE';

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
  | {
      kind: 'COULD_NOT_COMPLETE' | 'AI_UNAVAILABLE';
      userMessageId: string;
      text: string;
    }
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
async function chatFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ChatHttpError['body'];
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
      parts.push({
        type: 'data-draft-card',
        id: part.id ?? part.data.cardId,
        data: part.data,
      });
    }
  }
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    // The server sets the stored origin; on the client a Freelancer message is shown as typed (T22 adds presses).
    origin: message.role === 'user' ? 'TYPED' : null,
    parts,
    createdAt: '',
  };
}

interface ChatIslandProps {
  conversationId: string | null;
  initialMessages: ConversationMessageView[];
  invoiceLinks: Record<string, LinkedInvoiceState>;
  cards: Record<string, DraftCardView>;
  allowance: AllowanceState;
  start?: 'draft';
  /** ai-chat-v2 T20: where a new Conversation was opened from; sent with its first message only (AI_SECTION is omitted). */
  startedFrom?: ConversationStartPoint;
}

/** True when the device asks for reduced motion (AC-18): the composer then jumps instead of moving. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function ChatIsland(props: ChatIslandProps) {
  // On /ai the island becomes the new Conversation in place, so going back to /ai (the sidebar, "New
  // conversation") reaches the same mounted page: a fresh chat starts whenever the address returns to /ai.
  const pathname = usePathname();
  const [seen, setSeen] = useState({ pathname, chat: 0 });
  if (seen.pathname !== pathname) {
    setSeen({ pathname, chat: pathname === protectedRoutes.ai ? seen.chat + 1 : seen.chat });
  }
  return <ChatSession key={seen.chat} {...props} />;
}

function ChatSession({
  conversationId,
  initialMessages,
  invoiceLinks: initialInvoiceLinks,
  cards: initialCards,
  allowance: initialAllowance,
  start,
  startedFrom = 'AI_SECTION',
}: ChatIslandProps) {
  const router = useRouter();
  const newConversation = useNewConversation();
  // Mutable request bookkeeping read by the transport and SDK callbacks, never during render.
  const [live] = useState(() => createRequestState(conversationId));
  const [allowance, setAllowance] = useState(initialAllowance);
  const [usedUpMessage, setUsedUpMessage] = useState<string>();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [started, setStarted] = useState(false);
  const [text, setText] = useState('');
  const [replyDone, setReplyDone] = useState(false);
  // Only on /ai: the Conversation the first reply saved, and its cards and link states once read.
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(null);
  const [loaded, setLoaded] = useState<{
    cards: Record<string, DraftCardView>;
    invoiceLinks: Record<string, LinkedInvoiceState>;
  } | null>(null);
  const cards = loaded?.cards ?? initialCards;
  const invoiceLinks = loaded?.invoiceLinks ?? initialInvoiceLinks;
  const listRef = useRef<HTMLDivElement>(null);
  // ai-chat-v2 T20 (AC-18, screens.md §Motion): on the first send the composer moves from the middle of the start
  // screen to the bottom (FLIP over a translate transition), or jumps there under reduced motion.
  const startRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const moveFrom = useRef<number | null>(null);
  const [composerMove, setComposerMove] = useState<'animated' | 'none'>();
  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        fetch: chatFetch,
        prepareSendMessagesRequest: ({ messages }) => {
          const savedId = live.getConversationId();
          return {
            body: {
              conversationId: savedId,
              message: messages[messages.length - 1],
              // openapi ChatRequest: the start point goes with a new Conversation's first message only.
              ...(savedId === null && startedFrom !== 'AI_SECTION' ? { startedFrom } : {}),
            },
          };
        },
      })
  );

  const { messages, setMessages, sendMessage, status } = useChat<ChatMessage>({
    transport,
    messages: initialMessages.map(
      (m) => ({ id: m.id, role: m.role, parts: m.parts }) as ChatMessage
    ),
    onData: (part) => {
      if (part.type === 'data-conversation') {
        live.setConversationId(part.data.conversationId);
        if (conversationId === null) setSaved({ id: part.data.conversationId, title: part.data.title });
        newConversation?.announce({ id: part.data.conversationId, title: part.data.title });
        window.history.replaceState(
          window.history.state,
          '',
          `/ai/${part.data.conversationId}`
        );
      } else if (part.type === 'data-allowance') {
        setAllowance(part.data);
      } else if (part.type === 'data-outcome') {
        const { outcome } = part.data;
        setReplyDone(true);
        const sent = live.getPending();
        if (
          (outcome === 'COULD_NOT_COMPLETE' || outcome === 'AI_UNAVAILABLE') &&
          sent
        ) {
          setFailure({
            kind: outcome,
            userMessageId: sent.id,
            text: sent.text,
          });
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
          if (sent)
            setMessages((current) => current.filter((m) => m.id !== sent.id));
          // Contract 429 body (AllowanceUsedUpDetails): {kind, limit, renewsAt, timeZone}, not an AllowanceState.
          const details = error.body?.details as
            | { limit: number; renewsAt: string; timeZone: string }
            | undefined;
          setAllowance({
            ...initialAllowance,
            used: details?.limit ?? initialAllowance.limit,
            left: 0,
            ...(details
              ? { renewsAt: details.renewsAt, timeZone: details.timeZone }
              : {}),
          });
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
      if (sent)
        setFailure({
          kind: 'COULD_NOT_COMPLETE',
          userMessageId: sent.id,
          text: sent.text,
        });
    },
    onFinish: () => {
      // The island was mounted by /ai (no cards, no link states) and only the address was swapped, so a refresh
      // keeps serving that page, and a navigation to /ai/{id} would show its loading skeleton and remount the
      // chat (fix 2026-10-12). Read the saved Conversation's cards and link states instead.
      const savedId = live.getConversationId();
      if (conversationId === null && savedId) {
        void loadConversationCards(savedId).then(
          (result) => {
            if (result.success) setLoaded(result.data);
          },
          () => undefined
        );
        return;
      }
      router.refresh();
    },
  });

  const inFlight = status === 'submitted' || status === 'streaming';

  function send(raw: string) {
    const id = generateId();
    live.setPending({ id, text: raw });
    setReplyDone(false);
    setFailure(null);
    if (!started && conversationId === null) {
      const from = startRef.current?.querySelector('[data-slot="composer"]')?.getBoundingClientRect();
      moveFrom.current = from ? from.top : null;
      setComposerMove(prefersReducedMotion() ? 'none' : 'animated');
    }
    setStarted(true);
    setText('');
    void sendMessage({
      id,
      role: 'user',
      parts: [{ type: 'text', text: raw }],
    });
  }

  function tryAgain(failed: Extract<Failure, { userMessageId: string }>) {
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === failed.userMessageId);
      return index === -1 ? current : current.slice(0, index);
    });
    send(failed.text);
  }

  // Keep the newest message in view on mount and whenever one is added or streams.
  useEffect(() => {
    const els = listRef.current?.querySelectorAll('[data-role]');
    els?.[els.length - 1]?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  // FLIP: start the docked composer where the centred one was, then let the transition carry it to the bottom.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!started || composerMove !== 'animated' || !dock || moveFrom.current === null) return;
    const delta = moveFrom.current - dock.getBoundingClientRect().top;
    moveFrom.current = null;
    if (delta === 0) return;
    dock.style.transition = 'none';
    dock.style.transform = `translateY(${delta}px)`;
    void dock.offsetHeight; // apply the start position before the transition runs
    dock.style.transition = '';
    dock.style.transform = '';
  }, [started, composerMove]);

  if (conversationId === null && !started) {
    return (
      <div ref={startRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <ConversationListButton />
        <StartPanel state={allowance} start={start} onSend={send} />
      </div>
    );
  }

  // A failed reply is discarded whole: everything after the Freelancer's message is hidden.
  const failedIndex =
    failure && 'userMessageId' in failure
      ? messages.findIndex((m) => m.id === failure.userMessageId)
      : -1;
  const visible = (
    failedIndex === -1 ? messages : messages.slice(0, failedIndex + 1)
  )
    .map(toView)
    .filter((m) => m.parts.length > 0);
  const last = visible[visible.length - 1];
  const lastText =
    last?.role === 'assistant'
      ? last.parts
          .map((p) => (p.type === 'text' ? p.text : ''))
          .join('\n')
          .trim()
      : '';
  const waiting =
    inFlight && !(failedIndex !== -1) && last?.role !== 'assistant';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {saved ? <ConversationHeaderClient conversationId={saved.id} title={saved.title} /> : null}
      {/* ai-chat-v2 T19 (AC-15): only the messages scroll; the composer below stays docked. */}
      <div ref={listRef} data-slot="chat-scroll" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <MessageList
          messages={visible}
          invoiceLinks={invoiceLinks}
          renderCard={(id) =>
            cards[id] ? (
              <DraftCard card={cards[id]} cards={cards} />
            ) : (
              <Skeleton className="h-64 w-full" />
            )
          }
        />
        <div aria-live="polite" className="sr-only">
          {replyDone && !inFlight && lastText
            ? `Assistant replied: ${lastText}`
            : ''}
        </div>
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
              {failure.kind === 'AI_UNAVAILABLE'
                ? AI_UNAVAILABLE
                : COULD_NOT_COMPLETE}
            </AlertDescription>
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => tryAgain(failure)}
              >
                Try again
              </Button>
            </div>
          </Alert>
        ) : null}
        {failure?.kind === 'GONE' ? (
          <Alert variant="destructive">
            <AlertDescription>{CONVERSATION_GONE}</AlertDescription>
            <div className="mt-2">
              <Link
                href={protectedRoutes.ai}
                className={buttonVariants({ variant: 'outline' })}
              >
                Start a new conversation →
              </Link>
            </div>
          </Alert>
        ) : null}
      </div>
      <div
        ref={dockRef}
        data-slot="composer-dock"
        data-composer-move={composerMove}
        className="shrink-0 transition-transform duration-[250ms] ease-out motion-reduce:transition-none"
      >
        {allowance.left === 0 ? (
          <AllowanceNotice
            state={allowance}
            usedUpMessage={usedUpMessage}
            handMadeLink={start === 'draft'}
          />
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
            serverError={
              failure?.kind === 'VALIDATION' ? failure.message : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
