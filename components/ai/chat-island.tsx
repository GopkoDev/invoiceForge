'use client';

import '@/components/ai/zod-csp-safe';

import { Chat, useChat } from '@ai-sdk/react';
import { DefaultChatTransport, generateId, type ChatInit, type UIMessage } from 'ai';
import { ArrowDownIcon, InfoIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { HANDOFF_PARAM, hasHandoff, subscribeHandoffs, takeHandoff } from '@/components/ai/ai-handoff';
import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { Composer } from '@/components/ai/composer';
import { ConversationListButton } from '@/components/ai/ai-workspace';
import { ConversationHeaderClient } from '@/components/ai/conversation-header-client';
import { useNewConversation } from '@/components/ai/new-conversation-context';
import { DraftCard } from '@/components/ai/draft-card';
import { InvoiceStateProvider, useSeedInvoiceStates } from '@/components/ai/invoice-state-context';
import { MessageList } from '@/components/ai/message-list';
import { OfferedChoices } from '@/components/ai/offered-choices';
import { StartPanel } from '@/components/ai/start-panel';
import { useFollowLatest } from '@/components/ai/use-follow-latest';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { replaceAddress } from '@/components/ai/preview-address';
import { protectedRoutes } from '@/config/routes.config';
import { loadConversationCards } from '@/lib/actions/assistant-actions';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import type { AllowanceState, AppLink } from '@/lib/validations/assistant-chat';
import type {
  ConversationMessageView,
  ConversationStartPoint,
  DraftCardView,
  LinkedInvoiceState,
  OfferView,
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
    offer: { offerId: string };
    outcome: { outcome: OutcomeName; counted: boolean };
  }
>;

/** A press (ADR-0003): an option inside a stored offer, never a record id. */
type Choice = { offerId: string; optionId: number };

/** A dashboard prompt's first message (ADR-0009): origin DASHBOARD with startedFrom DASHBOARD_PROMPT. */
type Origin = 'DASHBOARD';

/** What the island sent last: the optimistic message id, its text and, for a press, the choice. */
type Pending = { id: string; text: string; choice?: Choice; origin?: Origin };

type Failure =
  | {
      kind: 'COULD_NOT_COMPLETE' | 'AI_UNAVAILABLE';
      userMessageId: string;
      text: string;
      choice?: Choice;
      origin?: Origin;
    }
  | { kind: 'GONE' }
  | { kind: 'VALIDATION'; message: string }
  /** 409 CHOICE_UNAVAILABLE after a press (AC-12b, AC-13): the contract sentence, verbatim. */
  | { kind: 'CHOICE_UNAVAILABLE'; message: string };

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
  let pending: Pending | null = null;
  return {
    getConversationId: () => conversationId,
    setConversationId: (id: string) => {
      conversationId = id;
    },
    getPending: () => pending,
    setPending: (next: Pending) => {
      pending = next;
    },
  };
}

type RequestState = ReturnType<typeof createRequestState>;
type ChatHandlers = Pick<ChatInit<ChatMessage>, 'onData' | 'onError' | 'onFinish'>;

/** What the island shows besides the messages, carried to the island that takes the live chat over. */
interface SessionUi {
  text: string;
  failure: Failure | null;
  allowance: AllowanceState;
  usedUpMessage?: string;
  replyDone: boolean;
}

/**
 * One live chat: the SDK's Chat (messages, status, the stream in flight), the request bookkeeping, and the handlers
 * of the island showing it now. Review 2026-10-13 R1-U2: once the first reply saved a Conversation the router knows
 * /ai/{id}, so its first revalidating server action (normally Create draft) re-renders the address as the
 * Conversation page, which mounts a new island. That island takes this session over instead of starting from the
 * server's messages: a reply in flight keeps streaming, and unsent text and an open alert stay.
 */
interface LiveSession {
  chat: Chat<ChatMessage>;
  live: RequestState;
  handlers: { current: ChatHandlers };
  /** Set by every render of the island showing it; null until the first. */
  ui: SessionUi | null;
  /** Islands showing it now; when none is left, the session waits for the next one at its address, then ends. */
  mounted: number;
  /** The saved Conversation's title (data-conversation), for an /ai page that shows the session at its address. */
  title: string | null;
  /** What the Chat reported while no island showed it (the router's loading state), replayed to the next island. */
  queued: ChatEvent[];
}

type ChatEvent =
  | { kind: 'data'; part: Parameters<NonNullable<ChatHandlers['onData']>>[0] }
  | { kind: 'error'; error: Error }
  | { kind: 'finish'; finished: Parameters<NonNullable<ChatHandlers['onFinish']>>[0] };

/** How long a session with no island waits at its Conversation's address for the router to mount the next island. */
const HANDOVER_GRACE_MS = 5000;
const HANDOVER_CHECK_MS = 100;

function deliver(handlers: ChatHandlers, event: ChatEvent): void {
  if (event.kind === 'data') handlers.onData?.(event.part);
  else if (event.kind === 'error') handlers.onError?.(event.error);
  else handlers.onFinish?.(event.finished);
}

/** To the island showing the session, or queued for the next one while none does. */
function report(session: LiveSession, event: ChatEvent): void {
  if (session.mounted > 0) deliver(session.handlers.current, event);
  else session.queued.push(event);
}

/** Live sessions by the Conversation they saved, for the island the router mounts at that Conversation's address. */
const liveSessions = new Map<string, LiveSession>();

function createLiveSession(
  conversationId: string | null,
  initialMessages: ConversationMessageView[],
  startedFrom: ConversationStartPoint
): LiveSession {
  const live = createRequestState(conversationId);
  const handlers: { current: ChatHandlers } = { current: {} };
  const transport = new DefaultChatTransport<ChatMessage>({
    api: '/api/chat',
    fetch: chatFetch,
    prepareSendMessagesRequest: ({ messages }) => {
      const savedId = live.getConversationId();
      const sent = live.getPending();
      const choice = sent?.choice;
      // openapi ChatRequest: origin DASHBOARD <=> startedFrom DASHBOARD_PROMPT, a new Conversation's first message only.
      const dashboard = !choice && savedId === null && sent?.origin === 'DASHBOARD';
      return {
        body: {
          conversationId: savedId,
          message: messages[messages.length - 1],
          // openapi ChatRequest: a press carries its choice and never an origin or a start point.
          ...(choice ? { choice } : {}),
          ...(dashboard ? { origin: 'DASHBOARD', startedFrom: 'DASHBOARD_PROMPT' } : {}),
          // openapi ChatRequest: the start point goes with a new Conversation's first message only.
          ...(!choice && !dashboard && savedId === null && startedFrom !== 'AI_SECTION' ? { startedFrom } : {}),
        },
      };
    },
  });
  const session: LiveSession = {
    chat: undefined as unknown as Chat<ChatMessage>,
    live,
    handlers,
    ui: null,
    mounted: 0,
    queued: [],
    title: null,
  };
  session.chat = new Chat<ChatMessage>({
    transport,
    messages: initialMessages.map((m) => ({ id: m.id, role: m.role, parts: m.parts }) as ChatMessage),
    onData: (part) => report(session, { kind: 'data', part }),
    onError: (error) => report(session, { kind: 'error', error }),
    onFinish: (finished) => report(session, { kind: 'finish', finished }),
  });
  return session;
}

/** The island showing `session` now: its handlers answer the Chat, and what it shows is kept for a hand-over. */
function showSession(session: LiveSession, handlers: ChatHandlers, ui: SessionUi): void {
  session.handlers.current = handlers;
  session.ui = ui;
}

function nameSession(session: LiveSession, title: string): void {
  session.title = title;
}

function endSession(session: LiveSession): void {
  session.chat.stop();
  session.queued = [];
  for (const [id, held] of liveSessions) if (held === session) liveSessions.delete(id);
}

/**
 * An island holds `session` while mounted; what the Chat reported while no island showed it is replayed to it first.
 * When the last island lets go, the session waits while the address is still its Conversation's: the router may show
 * that page's loading state before it mounts the next island (review 2026-10-13 R2-U1). It ends (its stream is
 * stopped, it is offered nowhere) once the address leaves, or after HANDOVER_GRACE_MS.
 */
function holdSession(session: LiveSession): () => void {
  session.mounted += 1;
  for (const event of session.queued.splice(0)) deliver(session.handlers.current, event);
  return () => {
    session.mounted -= 1;
    const deadline = Date.now() + HANDOVER_GRACE_MS;
    const check = () => {
      if (session.mounted > 0) return;
      const id = session.live.getConversationId();
      const waiting =
        id !== null && window.location.pathname === protectedRoutes.aiConversation(id) && Date.now() < deadline;
      if (waiting) setTimeout(check, HANDOVER_CHECK_MS);
      else endSession(session);
    };
    setTimeout(check, 0);
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
    } else if (part.type === 'data-offer') {
      parts.push({ type: 'data-offer', id: part.id ?? part.data.offerId, data: part.data });
    }
  }
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    // The server sets the stored origin; the client never sends one for a press (PRESSED is server-only).
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
  /** ai-chat-v2 T22: the Conversation's Offered choices by offer id (getConversation), restored on reopen (AC-13). */
  offers?: Record<string, OfferView>;
  allowance: AllowanceState;
  start?: 'draft';
  /** ai-chat-v2 T20: where a new Conversation was opened from; sent with its first message only (AI_SECTION is omitted). */
  startedFrom?: ConversationStartPoint;
  /** ai-chat-v2 T26: `/ai?handoff={id}`, the dashboard prompt's one-time sessionStorage entry (ADR-0009). */
  handoffId?: string;
}

/** True when the device asks for reduced motion (AC-18): the composer then jumps instead of moving. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function ChatIsland(props: ChatIslandProps) {
  // On /ai the island becomes the new Conversation in place, so going back to /ai (the sidebar, "New
  // conversation") reaches the same mounted page: a fresh chat starts whenever the address returns to /ai.
  const pathname = usePathname();
  const router = useRouter();
  const [seen, setSeen] = useState({ pathname, chat: 0 });
  if (seen.pathname !== pathname) {
    setSeen({ pathname, chat: pathname === protectedRoutes.ai ? seen.chat + 1 : seen.chat });
  }
  // ai-chat-v2 T31 finding: a Conversation started in place keeps the /ai page's tree in its history entry, so Back
  // then Forward to /ai/{id} mounts /ai's page again, and after "New chat" Back reaches /ai/{id} on the same mounted
  // page (review 2026-10-13 R2-U3). At a Conversation address the /ai page shows only the live chat that saved that
  // Conversation; otherwise the island shows a skeleton and refreshes once, so the server renders the saved page.
  const openId = pathname?.startsWith(`${protectedRoutes.ai}/`) ? pathname.slice(protectedRoutes.ai.length + 1) : null;
  // The /ai page restored at a Conversation address shows that Conversation's live chat when one is held (R3-U3).
  const liveAtAddress = props.conversationId === null && openId !== null ? openId : null;
  const staleEntry = liveAtAddress !== null && !liveSessions.has(liveAtAddress);
  useEffect(() => {
    if (staleEntry) router.refresh();
  }, [staleEntry, router]);
  if (staleEntry) return <Skeleton className="min-h-0 w-full flex-1" />;
  // ai-chat-v2 T23 (ADR-0008): the island shares the workspace's invoice-state store (or holds its own outside it).
  return (
    <InvoiceStateProvider>
      <ChatSession key={seen.chat} {...props} liveAt={liveAtAddress} />
    </InvoiceStateProvider>
  );
}

const NO_OFFERS: Record<string, OfferView> = {};

function ChatSession({
  conversationId,
  initialMessages,
  invoiceLinks: initialInvoiceLinks,
  cards: initialCards,
  offers: initialOffers = NO_OFFERS,
  allowance: initialAllowance,
  start,
  startedFrom = 'AI_SECTION',
  handoffId,
  liveAt = null,
}: ChatIslandProps & {
  /** On the /ai page at a Conversation address: the Conversation whose live chat to show (R3-U3). */
  liveAt?: string | null;
}) {
  const router = useRouter();
  const newConversation = useNewConversation();
  // The live chat this island shows: the one handed over at this Conversation's address, or a new one.
  const adoptId = conversationId ?? liveAt;
  const [session] = useState<LiveSession>(
    () =>
      (adoptId !== null ? liveSessions.get(adoptId) : undefined) ??
      createLiveSession(conversationId, initialMessages, startedFrom)
  );
  // Mutable request bookkeeping read by the transport and SDK callbacks, never during render.
  const { live } = session;
  const [handedOver] = useState(session.ui);
  const [allowance, setAllowance] = useState(handedOver?.allowance ?? initialAllowance);
  const [usedUpMessage, setUsedUpMessage] = useState<string | undefined>(handedOver?.usedUpMessage);
  const [failure, setFailure] = useState<Failure | null>(handedOver?.failure ?? null);
  // An /ai page showing a handed-over chat starts past the start screen, under that Conversation's header.
  const [started, setStarted] = useState(conversationId === null && liveAt !== null && handedOver !== null);
  const [text, setText] = useState(handedOver?.text ?? '');
  const [replyDone, setReplyDone] = useState(handedOver?.replyDone ?? false);
  // Only on /ai: the Conversation the first reply saved, and its cards and link states once read.
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(() => {
    const savedId = session.live.getConversationId();
    return conversationId === null && liveAt !== null && savedId === liveAt && session.title !== null
      ? { id: savedId, title: session.title }
      : null;
  });
  const [loaded, setLoaded] = useState<{
    cards: Record<string, DraftCardView>;
    invoiceLinks: Record<string, LinkedInvoiceState>;
    offers: Record<string, OfferView>;
  } | null>(null);
  const cards = loaded?.cards ?? initialCards;
  const invoiceLinks = loaded?.invoiceLinks ?? initialInvoiceLinks;
  const offers = loaded?.offers ?? initialOffers;
  // ai-chat-v2 T23: every page load (and the post-reply read on /ai) seeds the shared invoice-state store.
  useSeedInvoiceStates(invoiceLinks, cards);
  // ai-chat-v2 T20 (AC-18, screens.md §Motion): on the first send the composer moves from the middle of the start
  // screen to the bottom (FLIP over a translate transition), or jumps there under reduced motion.
  const startRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const moveFrom = useRef<number | null>(null);
  const [composerMove, setComposerMove] = useState<'animated' | 'none'>();
  const { messages, setMessages, sendMessage, status } = useChat<ChatMessage>({ chat: session.chat });

  // The handlers of the island showing the session now (the Chat calls them), and what it shows besides the messages.
  const handlers: ChatHandlers = {
    onData: (part) => {
      if (part.type === 'data-conversation') {
        live.setConversationId(part.data.conversationId);
        liveSessions.set(part.data.conversationId, session);
        nameSession(session, part.data.title);
        if (conversationId === null) setSaved({ id: part.data.conversationId, title: part.data.title });
        newConversation?.announce({ id: part.data.conversationId, title: part.data.title });
        replaceAddress(`/ai/${part.data.conversationId}`);
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
            choice: sent.choice,
            origin: sent.origin,
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
          // screens.md §SCR-02 "used-up on send": a refused first message saves nothing, so the composer's place
          // returns to the middle without animation and the centred used-up notice shows.
          if (conversationId === null && live.getConversationId() === null) {
            setStarted(false);
            setComposerMove(undefined);
          }
          return;
        }
        if (error.status === 404) {
          setFailure({ kind: 'GONE' });
          return;
        }
        if (error.status === 409) {
          // AC-12b, AC-13: the press is not applied; drop the optimistic message, leave the buttons as they were.
          if (sent) setMessages((current) => current.filter((m) => m.id !== sent.id));
          setFailure({ kind: 'CHOICE_UNAVAILABLE', message: error.message });
          return;
        }
        if (error.status === 400) {
          if (sent) {
            setMessages((current) => current.filter((m) => m.id !== sent.id));
            // A press's label is never put into the box: only typed text is given back.
            if (!sent.choice) setText(sent.text);
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
          choice: sent.choice,
          origin: sent.origin,
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
            if (result.success) setLoaded({ ...result.data, offers: result.data.offers ?? {} });
          },
          () => undefined
        );
        return;
      }
      router.refresh();
    },
  };
  useLayoutEffect(() => {
    showSession(session, handlers, { text, failure, allowance, usedUpMessage, replyDone });
  });
  // Held and let go in the commit itself, so nothing the stream reports between two islands is lost (R3-U2).
  useLayoutEffect(() => holdSession(session), [session]);
  // A Conversation page restored from the router cache can take over an idle live chat with newer messages than its
  // props (a newer reply's card, choices, link states, or a press's chosen mark): refresh once so they load (R5-U2,
  // R6-U2). A chat taken over mid-reply is refreshed by that reply's onFinish instead, so only once (R6-U3).
  const staleProps = useRef(
    conversationId !== null &&
      handedOver !== null &&
      session.chat.status !== 'submitted' &&
      session.chat.status !== 'streaming' &&
      session.chat.messages.length > initialMessages.length
  );
  useEffect(() => {
    if (!staleProps.current) return;
    staleProps.current = false;
    router.refresh();
  }, [router]);
  // The /ai page that took a live chat over at its Conversation's address has no cards, links or choices of its own
  // (its page loaded none): read them once, and put the Conversation back at the head of the list (R4-U1).
  const adoptedAt = useRef(conversationId === null && liveAt !== null && handedOver !== null ? liveAt : null);
  useEffect(() => {
    const id = adoptedAt.current;
    if (id === null) return;
    adoptedAt.current = null;
    if (session.title !== null) newConversation?.announce({ id, title: session.title });
    void loadConversationCards(id).then(
      (result) => {
        if (result.success) setLoaded({ ...result.data, offers: result.data.offers ?? {} });
      },
      () => undefined
    );
  }, [session, newConversation]);

  const inFlight = status === 'submitted' || status === 'streaming';

  // ai-chat-v2 T21 (AC-16): follow new text while the end is within 48 px of view; otherwise offer the jump.
  const { scrollRef, showJump, jumpToLatest } = useFollowLatest(messages);

  function send(raw: string, choice?: Choice, origin?: Origin) {
    const id = generateId();
    live.setPending({ id, text: raw, choice, origin });
    setReplyDone(false);
    setFailure(null);
    // A dashboard prompt opens straight into the Conversation layout: nothing moved, so nothing animates.
    if (origin === 'DASHBOARD') setComposerMove('none');
    else if (!started && conversationId === null) {
      const from = startRef.current?.querySelector('[data-slot="composer"]')?.getBoundingClientRect();
      moveFrom.current = from ? from.top : null;
      setComposerMove(prefersReducedMotion() ? 'none' : 'animated');
    }
    setStarted(true);
    setText('');
    // screens.md §SCR-03: sending a message always scrolls to the bottom.
    jumpToLatest(true);
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
    send(failed.text, failed.choice, failed.origin);
  }

  // SCR-04: a press sends the stored label as the optimistic message plus { offerId, optionId }.
  function press(offerId: string, optionId: number, label: string) {
    send(label, { offerId, optionId });
  }

  // ai-chat-v2 T26 (ADR-0009; SCR-02 "handoff"): take the dashboard prompt once, drop ?handoff= from the address and
  // send it; a missing, taken or blocked entry falls back to the plain start screen with nothing sent.
  // While the entry waits (and on the server, which cannot see it) the start screen is not shown.
  const awaitingHandoff = useSyncExternalStore(
    subscribeHandoffs,
    () => Boolean(handoffId) && conversationId === null && hasHandoff(handoffId!),
    () => Boolean(handoffId) && conversationId === null
  );
  const handoffTaken = useRef(false);
  // The hand-off effect reads the latest send without re-running when it changes.
  const sendRef = useRef<typeof send | null>(null);
  useLayoutEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    if (!handoffId || conversationId !== null || handoffTaken.current) return;
    handoffTaken.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has(HANDOFF_PARAM)) {
      url.searchParams.delete(HANDOFF_PARAM);
      replaceAddress(`${url.pathname}${url.search}${url.hash}`);
    }
    const prompt = takeHandoff(handoffId);
    if (prompt !== null && prompt.trim()) sendRef.current?.(prompt.trim(), undefined, 'DASHBOARD');
  }, [handoffId, conversationId]);


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

  if (conversationId === null && !started && !awaitingHandoff) {
    return (
      <div ref={startRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <ConversationListButton />
        <StartPanel state={allowance} start={start} onSend={send} usedUpMessage={usedUpMessage} />
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
  // SCR-04: only the newest reply's choices can be pressed, and not while a turn is in flight. A failed message
  // left in view (could-not-complete) does not count as newer: the offer was released, so it is pressable again.
  const tail = failedIndex !== -1 ? visible[visible.length - 2] : last;
  const latestReplyId = !inFlight && tail?.role === 'assistant' ? tail.id : null;
  const sentChoice = inFlight ? live.getPending()?.choice : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {saved ? (
        <ConversationHeaderClient conversationId={saved.id} title={saved.title} />
      ) : conversationId === null ? (
        // Below md the list stays reachable from the first send, also when it fails and nothing is saved (R5-U3).
        // md:hidden like the button itself, so the desktop layout keeps no empty row.
        <div className="flex shrink-0 items-center md:hidden">
          <ConversationListButton />
        </div>
      ) : null}
      {/* ai-chat-v2 T19 (AC-15): only the messages scroll; the composer below stays docked. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} data-slot="chat-scroll" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <MessageList
          messages={visible}
          invoiceLinks={invoiceLinks}
          renderOffer={(offerId, messageId) => (
            <OfferedChoices
              offer={offers[offerId]}
              isLatest={messageId === latestReplyId}
              pendingOptionId={sentChoice?.offerId === offerId ? sentChoice.optionId : null}
              onPress={press}
            />
          )}
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
        {failure?.kind === 'CHOICE_UNAVAILABLE' ? (
          // SCR-03 "choice unavailable": a non-destructive notice in the reply position.
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>{failure.message}</AlertDescription>
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
      {showJump ? (
        // screens.md §SCR-03 "scrolled up": centred 12 px above the composer.
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-slot="jump-to-latest"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-sm"
          onClick={() => jumpToLatest()}
        >
          <ArrowDownIcon aria-hidden />
          Jump to latest
        </Button>
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
