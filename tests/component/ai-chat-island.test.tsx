// @vitest-environment jsdom
// T33 (ai-assistant; AC-09, AC-10b, AC-11, AC-11b) - SCR-02 live states and SCR-01 "sending first message":
// the useChat island posts only the new message to /api/chat, shows waiting / streaming and every outcome,
// and keeps the allowance counter live. See tasks/t33-chat-island.md and screens.md §SCR-02, §SCR-01.
//
// Seams the implementer must provide:
//   components/ai/chat-island.tsx -> 'use client'; export function ChatIsland(props: {
//     conversationId: string | null;               // null = /ai start: renders the StartPanel until the first send
//     initialMessages: ConversationMessageView[];  // from getConversation (empty on /ai)
//     invoiceLinks: Record<string, LinkedInvoiceState>;
//     cards: Record<string, DraftCardView>;        // a streamed data-draft-card renders <DraftCard card={cards[id]} />
//                                                  // (or a Skeleton until router.refresh() brings the card in)
//     allowance: AllowanceState;
//     start?: 'draft';                             // forwarded to the StartPanel
//   })
//     useChat + a transport posting to /api/chat whose prepareSendMessagesRequest sends ONLY
//     { conversationId, message } (message = the new user UIMessage; no history). Reads data-conversation
//     (history.replaceState to /ai/{id}, no router navigation, no remount, next send carries the id),
//     data-allowance (live counter), data-draft-card, data-link, data-outcome. router.refresh() after finish.
//   components/ai/composer.tsx -> textbox aria-label "Message", button "Send"; Enter sends, Shift+Enter is a
//     newline; both disabled while a reply is in flight; trimmed length > 2,000 disables Send and shows the
//     contract message + "{n} / 2,000"; counter = AllowanceNotice (counter mode).
//   app/(protected)/ai/[conversationId]/page.tsx and app/(protected)/ai/page.tsx mount the island (page test below).
// Network is faked by stubbing global fetch with scripted UI-message-stream SSE bodies / error JSON.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const router = { push, refresh, replace };
let pathname = '/ai';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const goToSignIn = vi.fn();
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: () => goToSignIn(),
  isUnauthorizedFailure: () => false,
  isRedirectingToSignIn: () => false,
  redirectIfUnauthorized: () => false,
}));

const loadConversationCards = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadConversationCards: (...a: unknown[]) => loadConversationCards(...a),
  createDraftFromCard: vi.fn(),
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));
vi.mock('@/components/ai/draft-card', () => ({
  DraftCard: ({ card }: { card: { id: string } }) => (
    <div data-testid="draft-card">{`card ${card.id}`}</div>
  ),
}));

const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  getConversation: (...a: unknown[]) => getConversation(...a),
  listConversationSummaries: async () => ({
    success: true,
    data: { items: [], timeZone: 'UTC' },
  }),
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({
    success: true,
    data: { userId: 'u1', timeZone: 'UTC' },
  }),
}));
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: async () => ({
    success: true,
    data: {
      limit: 30,
      used: 12,
      left: 18,
      renewsAt: '2026-10-13T00:00:00.000Z',
      timeZone: 'UTC',
    },
  }),
}));

import { ChatIsland } from '@/components/ai/chat-island';
import { AiWorkspace } from '@/components/ai/ai-workspace';
import {
  NewConversationProvider,
  useNewConversation,
} from '@/components/ai/new-conversation-context';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { DraftCardView } from '@/types/assistant/types';

const TOO_LONG =
  'Messages can be at most 2,000 characters. Shorten it and send again.';
const COULD_NOT = "The reply couldn't be completed. Try again.";
const UNAVAILABLE =
  'AI is temporarily unavailable. Try again in a few minutes. The rest of Invoice Forge works as usual.';
const GONE = "This conversation can't be found.";
const USED_UP_TEXT =
  "You've used today's 30 messages. They renew at 00:00 your time. An AI client connected with a Personal key isn't affected.";
const SIGN_IN = '/api/auth/clear-session';

const allowance = (left: number): AllowanceState => ({
  limit: 30,
  used: 30 - left,
  left,
  renewsAt: '2026-10-13T00:00:00.000Z',
  timeZone: 'UTC',
});
const allowanceChunk = (left: number) => ({
  type: 'data-allowance',
  transient: true,
  data: allowance(left),
});
const outcome = (o: string, counted: boolean) => ({
  type: 'data-outcome',
  data: { outcome: o, counted },
});
const textChunks = (text: string) => [
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
];
const START = { type: 'start', messageId: 'msg_srv_1' };
const FINISH = { type: 'finish' };

const enc = new TextEncoder();
const frame = (c: unknown) => enc.encode(`data: ${JSON.stringify(c)}\n\n`);
const sseHeaders = {
  'content-type': 'text/event-stream',
  'x-vercel-ai-ui-message-stream': 'v1',
};

function sse(chunks: unknown[]): Response {
  const body =
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') +
    'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: sseHeaders });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
/** A stream the test feeds chunk by chunk, so waiting / streaming can be observed mid-flight. */
function openStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: sseHeaders }),
    push: (c: unknown) => ctrl.enqueue(frame(c)),
    end: () => {
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  };
}

const fetchMock = vi.fn();
const replaceState = vi.spyOn(window.history, 'replaceState');

function bodyOf(call: number) {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body)) as {
    conversationId: string | null;
    message: {
      id: string;
      role: string;
      parts: Array<{ type: string; text: string }>;
    };
    messages?: unknown;
  };
}

function island(over: Partial<Parameters<typeof ChatIsland>[0]> = {}) {
  return render(
    <ChatIsland
      conversationId="c1"
      initialMessages={[
        {
          id: 'm1',
          role: 'user',
          origin: 'TYPED',
          parts: [{ type: 'text', text: 'Who owes me money?' }],
          createdAt: '2026-10-12T10:00:00.000Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          origin: null,
          parts: [{ type: 'text', text: 'Acme owes you 100.' }],
          createdAt: '2026-10-12T10:00:01.000Z',
        },
      ]}
      invoiceLinks={{}}
      cards={{}}
      allowance={allowance(12)}
      {...over}
    />
  );
}

// ai-chat-v2 T37: the start screen's greeting h1 ends with this line whatever the time and name.
const START_GREETING = /How can I help with your invoices today\?/;
const box = () => screen.getByRole('textbox', { name: 'Message' });

/** ai-chat-v2 T36: a failure is an assistant message (avatar + inline alert + "Try again") after the user's bubble. */
function expectFailureMessage(alert: HTMLElement) {
  const message = alert.closest('[data-role="assistant"]') as HTMLElement;
  expect(message).not.toBeNull();
  expect(message.querySelector('[data-slot="message-avatar"]')).not.toBeNull();
  const retry = within(message).getByRole('button', { name: 'Try again' });
  expect(retry.closest('[data-slot="message-actions"]')).not.toBeNull();
  const rows = Array.from(document.querySelectorAll('[data-role]'));
  expect(rows[rows.length - 1]).toBe(message);
  expect(rows[rows.length - 2].getAttribute('data-role')).toBe('user');
}
const sendBtn = () => screen.getByRole('button', { name: 'Send' });

async function send(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(box(), text);
  await user.click(sendBtn());
}

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  push.mockReset();
  replace.mockReset();
  goToSignIn.mockReset();
  // Each test starts at /ai: a live chat a previous test left waiting at its Conversation's address then ends.
  window.history.replaceState(null, '', '/ai');
  replaceState.mockClear();
  pathname = '/ai';
  loadConversationCards.mockReset();
  loadConversationCards.mockResolvedValue({
    success: true,
    data: { cards: {}, invoiceLinks: {} },
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('T33 ChatIsland - request shape', () => {
  it('posts only the new message and the conversationId, never the history', async () => {
    fetchMock.mockResolvedValue(
      sse([START, ...textChunks('ok'), outcome('ANSWERED', true), FINISH])
    );
    const user = userEvent.setup();
    island();
    await send(user, "What's overdue today?");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat');
    const body = bodyOf(0);
    expect(body.conversationId).toBe('c1');
    expect(body.message.role).toBe('user');
    expect(body.message.parts).toEqual([
      { type: 'text', text: "What's overdue today?" },
    ]);
    expect(body.messages).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(['conversationId', 'message']);
  });

  it('Enter sends, Shift+Enter inserts a newline, and Enter twice quickly sends one message', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValue(stream.response);
    const user = userEvent.setup();
    island();

    await user.type(box(), 'line one{Shift>}{Enter}{/Shift}line two');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((box() as HTMLTextAreaElement).value).toBe('line one\nline two');

    await user.keyboard('{Enter}{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).message.parts[0].text).toBe('line one\nline two');
    stream.push(START);
    stream.end();
  });
});

describe('T33 ChatIsland - waiting and streaming', () => {
  it('shows the message at once, then Thinking with the composer disabled until the first words', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValue(stream.response);
    const user = userEvent.setup();
    island();
    await send(user, "What's overdue today?");

    expect(await screen.findByText("What's overdue today?")).toBeTruthy();
    expect(screen.getByText('Thinking…')).toBeTruthy();
    expect(screen.getByText('Assistant is replying…')).toBeTruthy();
    // ai-chat-v2 T41: the waiting row is not a message: every [data-role] element is a real message (the reply that
    // replaces the row is the next one), so a reader of the last reply never reads "Thinking…".
    expect(screen.getByText('Thinking…').closest('[data-role]')).toBeNull();
    expect((sendBtn() as HTMLButtonElement).disabled).toBe(true);
    expect((box() as HTMLTextAreaElement).disabled).toBe(true);

    await act(async () => {
      stream.push(allowanceChunk(11));
      stream.push(START);
      stream.push({ type: 'text-start', id: 't1' });
      stream.push({ type: 'text-delta', id: 't1', delta: 'You have two ' });
    });
    // streaming: partial text is visible while the stream is still open; waiting is over
    expect(await screen.findByText(/You have two/)).toBeTruthy();
    expect(screen.queryByText('Thinking…')).toBeNull();
    expect(screen.getByText('11 of 30 messages left today')).toBeTruthy();

    await act(async () => {
      stream.push({ type: 'text-delta', id: 't1', delta: 'overdue invoices.' });
      stream.push({ type: 'text-end', id: 't1' });
      stream.push(outcome('ANSWERED', true));
      stream.push(FINISH);
      stream.end();
    });
    expect(
      await screen.findByText('You have two overdue invoices.')
    ).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() =>
      expect((box() as HTMLTextAreaElement).disabled).toBe(false)
    );
  });
});

describe('T33 ChatIsland - AC-09 answered keeps the counter live', () => {
  it('18 sent today -> after one more the chat shows 11 messages left', async () => {
    fetchMock.mockResolvedValue(
      sse([
        allowanceChunk(11),
        START,
        ...textChunks('Two are overdue.'),
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    island({ allowance: allowance(12) });
    expect(screen.getByText('12 of 30 messages left today')).toBeTruthy();
    await send(user, 'Who is late?');
    expect(await screen.findByText('Two are overdue.')).toBeTruthy();
    expect(screen.getByText('11 of 30 messages left today')).toBeTruthy();
  });
});

describe('T33 ChatIsland - partial (AC-11b)', () => {
  it('keeps the part found and the saved narrower-question sentence, adds nothing', async () => {
    const reply =
      'Found 3 invoices so far. That was too broad to answer in full. Try a narrower question, for example one Customer.';
    fetchMock.mockResolvedValue(
      sse([
        allowanceChunk(11),
        START,
        ...textChunks(reply),
        outcome('PARTIAL', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    island();
    await send(user, 'Everything about everything');
    expect(await screen.findByText(reply)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText('11 of 30 messages left today')).toBeTruthy();
  });
});

describe('T33 ChatIsland - could-not-complete (AC-11)', () => {
  it('discards streamed text, restores the counter, and Try again resends the same text as a new message', async () => {
    fetchMock
      .mockResolvedValueOnce(
        sse([
          allowanceChunk(11),
          START,
          ...textChunks('Half an answ'),
          outcome('COULD_NOT_COMPLETE', false),
          allowanceChunk(12),
          FINISH,
        ])
      )
      .mockResolvedValueOnce(
        sse([
          allowanceChunk(11),
          START,
          ...textChunks('Done now.'),
          outcome('ANSWERED', true),
          FINISH,
        ])
      );
    const user = userEvent.setup();
    island({ allowance: allowance(12) });
    await send(user, 'Who is late?');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(COULD_NOT);
    expect(screen.queryByText(/Half an answ/)).toBeNull();
    expect(screen.getByText('12 of 30 messages left today')).toBeTruthy();
    // ai-chat-v2 T36 (screens.md «Errors are messages»): the alert and its Try again sit in an assistant message in
    // the reply position (after the Freelancer's bubble), with the avatar; no bare full-width card.
    expectFailureMessage(alert);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).message.parts[0].text).toBe('Who is late?');
    expect(bodyOf(1).message.id).not.toBe(bodyOf(0).message.id);
    expect(await screen.findByText('Done now.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('11 of 30 messages left today')).toBeTruthy();
  });

  it('503 FAILED before the stream shows the same alert with Try again', async () => {
    fetchMock.mockResolvedValue(
      json(503, { success: false, code: 'FAILED', error: COULD_NOT })
    );
    const user = userEvent.setup();
    island();
    await send(user, 'Who is late?');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(COULD_NOT);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText('12 of 30 messages left today')).toBeTruthy();
  });

  it('a network failure (fetch rejects) is shown as could-not-complete with Try again', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    island();
    await send(user, 'Who is late?');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(COULD_NOT);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect((box() as HTMLTextAreaElement).disabled).toBe(false);
  });
});

describe('T33 ChatIsland - ai-unavailable', () => {
  it('shows the outage alert with Try again; the counter is not spent', async () => {
    fetchMock.mockResolvedValue(
      sse([
        allowanceChunk(11),
        outcome('AI_UNAVAILABLE', false),
        allowanceChunk(12),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    island({ allowance: allowance(12) });
    await send(user, 'Who is late?');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(UNAVAILABLE);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText('12 of 30 messages left today')).toBeTruthy();
    expectFailureMessage(alert);
  });
});

describe('T33 ChatIsland - too-long', () => {
  it('over 2,000 characters after trimming: message + count, Send disabled, text kept, nothing posted', async () => {
    const user = userEvent.setup();
    island();
    const long = 'a'.repeat(2001);
    fireEvent.change(box(), { target: { value: long } });
    expect(screen.getByText(TOO_LONG)).toBeTruthy();
    expect(screen.getByText('2,001 / 2,000')).toBeTruthy();
    expect((sendBtn() as HTMLButtonElement).disabled).toBe(true);
    expect((box() as HTMLTextAreaElement).value).toBe(long);
    await user.click(sendBtn());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trailing whitespace does not count: 2,000 characters plus spaces can be sent', () => {
    island();
    fireEvent.change(box(), { target: { value: `${'a'.repeat(2000)}   ` } });
    expect(screen.queryByText(TOO_LONG)).toBeNull();
    expect((sendBtn() as HTMLButtonElement).disabled).toBe(false);
  });

  it('a 400 VALIDATION from the route shows the same message', async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        success: false,
        code: 'VALIDATION',
        error: TOO_LONG,
        fieldErrors: { 'message.parts.0.text': [TOO_LONG] },
      })
    );
    const user = userEvent.setup();
    island();
    await send(user, 'hello');
    expect(await screen.findByText(TOO_LONG)).toBeTruthy();
  });
});

describe('T33 ChatIsland - used-up (AC-10b)', () => {
  it('left = 0 on load: the composer is replaced by the used-up notice; the exchange stays readable', () => {
    island({ allowance: allowance(0) });
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByText("You've used today's 30 messages")).toBeTruthy();
    expect(screen.getByText('Acme owes you 100.')).toBeTruthy();
  });

  it('the losing tab: 429 removes the unsent message and shows the server text, composer replaced', async () => {
    fetchMock.mockResolvedValue(
      // R-01: the contract 429 body (openapi /api/chat 429: AllowanceUsedUpDetails), not an AllowanceState
      json(429, {
        success: false,
        code: 'RATE_LIMITED',
        error: USED_UP_TEXT,
        details: {
          kind: 'ALLOWANCE_USED_UP',
          limit: 30,
          renewsAt: '2026-10-13T00:00:00.000Z',
          timeZone: 'UTC',
        },
      })
    );
    const user = userEvent.setup();
    island({ allowance: allowance(1) });
    await send(user, 'second tab message');

    expect(await screen.findByText(USED_UP_TEXT)).toBeTruthy();
    expect(screen.queryByText('second tab message')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Connect your own AI client →' })
    ).toBeTruthy();
    expect(screen.getByText('Acme owes you 100.')).toBeTruthy();
  });
});

describe('T33 ChatIsland - conversation-gone and signed out', () => {
  it('404 NOT_FOUND shows the alert with a link to /ai and disables the composer', async () => {
    fetchMock.mockResolvedValue(
      json(404, { success: false, code: 'NOT_FOUND', error: GONE })
    );
    const user = userEvent.setup();
    island();
    await send(user, 'hello');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(GONE);
    const link = screen.getByRole('link', {
      name: 'Start a new conversation →',
    });
    expect(link.getAttribute('href')).toBe('/ai');
    expect((box() as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('401 on send goes through goToSignIn', async () => {
    fetchMock.mockResolvedValue(
      json(401, {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Not signed in.',
      })
    );
    const user = userEvent.setup();
    island();
    await send(user, 'hello');
    await waitFor(() => expect(goToSignIn).toHaveBeenCalledTimes(1));
    expect(SIGN_IN).toBe('/api/auth/clear-session');
  });
});

describe('T33 ChatIsland - cards and links as they arrive', () => {
  it('a streamed data-draft-card renders the DraftCard and the island refreshes after finish', async () => {
    const card = { id: 'card1' } as unknown as DraftCardView;
    fetchMock.mockResolvedValue(
      sse([
        allowanceChunk(11),
        START,
        ...textChunks('Here is the draft.'),
        { type: 'data-draft-card', id: 'card1', data: { cardId: 'card1' } },
        { type: 'data-link', data: { kind: 'page', page: 'sender-profiles' } },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    island({ cards: { card1: card } });
    await send(user, 'Invoice Acme for 20 hours at $50');
    expect((await screen.findByTestId('draft-card')).textContent).toBe(
      'card card1'
    );
    expect(
      screen.getByRole('link', { name: 'Sender profiles →' })
    ).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('T33 ChatIsland - SCR-01 sending the first message', () => {
  it('turns into the conversation at once, swaps the URL to /ai/{id} without navigating, then sends with the id', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    const user = userEvent.setup();
    render(
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance(30)}
      />
    );
    expect(screen.getByRole('heading', { name: START_GREETING })).toBeTruthy();
    await send(user, 'Who owes me money right now?');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).conversationId).toBeNull();
    expect(
      await screen.findByText('Who owes me money right now?')
    ).toBeTruthy();
    expect(screen.getByText('Thinking…')).toBeTruthy();

    await act(async () => {
      stream.push({
        type: 'data-conversation',
        data: { conversationId: 'cNew', title: 'Who owes me money right now?' },
      });
      stream.push(allowanceChunk(29));
      stream.push(START);
      stream.push({ type: 'text-start', id: 't1' });
      stream.push({ type: 'text-delta', id: 't1', delta: 'Nobody yet.' });
    });
    await waitFor(() =>
      expect(
        replaceState.mock.calls.some((c) => String(c[2]).endsWith('/ai/cNew'))
      ).toBe(true)
    );
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // not remounted: the user message and the streaming reply are both still on screen
    expect(
      screen.getByText('Who owes me money right now?', { selector: 'p' })
    ).toBeTruthy();
    expect(await screen.findByText(/Nobody yet\./)).toBeTruthy();
    expect(screen.getByText('29 of 30 messages left today')).toBeTruthy();

    await act(async () => {
      stream.push({ type: 'text-end', id: 't1' });
      stream.push(outcome('ANSWERED', true));
      stream.push(FINISH);
      stream.end();
    });
    await waitFor(() =>
      expect((box() as HTMLTextAreaElement).disabled).toBe(false)
    );

    fetchMock.mockResolvedValueOnce(
      sse([START, ...textChunks('ok'), outcome('ANSWERED', true), FINISH])
    );
    await send(user, 'and Globex?');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).conversationId).toBe('cNew');
    expect(bodyOf(1).message.parts[0].text).toBe('and Globex?');
  });
});

describe('T33 page wiring', () => {
  it('/ai/[conversationId] mounts the island: composer and live counter under the saved exchange', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Who owes me money?' },
        messages: [
          {
            id: 'm1',
            role: 'user',
            origin: 'TYPED',
            parts: [{ type: 'text', text: 'Who owes me money?' }],
            createdAt: '2026-10-12T10:00:00.000Z',
          },
        ],
        invoiceLinks: {},
        cards: {},
      },
    });
    render(
      await ConversationPage({
        params: Promise.resolve({ conversationId: 'c1' }),
      })
    );
    expect(
      screen.getByText('Who owes me money?', { selector: 'p' })
    ).toBeTruthy();
    expect(box()).toBeTruthy();
    expect(screen.getByText('18 of 30 messages left today')).toBeTruthy();
  });
});

const startPanelIsland = () =>
  render(
    <ChatIsland
      conversationId={null}
      initialMessages={[]}
      invoiceLinks={{}}
      cards={{}}
      allowance={allowance(30)}
    />
  );

describe('T39 R-01 - contract 429 body', () => {
  it('shows the used-up message and disables (removes) the composer for the contract body', async () => {
    fetchMock.mockResolvedValue(
      json(429, {
        success: false,
        code: 'RATE_LIMITED',
        error: USED_UP_TEXT,
        details: {
          kind: 'ALLOWANCE_USED_UP',
          limit: 30,
          renewsAt: '2026-10-13T00:00:00.000Z',
          timeZone: 'UTC',
        },
      })
    );
    const user = userEvent.setup();
    island({ allowance: allowance(5) });
    await send(user, 'one too many');
    expect(await screen.findByText(USED_UP_TEXT)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.queryByText('one too many')).toBeNull();
  });
});

describe('T39 R-02 - first message on /ai', () => {
  it.each([
    ['AI_UNAVAILABLE', UNAVAILABLE],
    ['COULD_NOT_COMPLETE', COULD_NOT],
  ])(
    '%s with no data-conversation: alert, URL stays /ai, Try again posts conversationId null',
    async (kind, text) => {
      fetchMock.mockResolvedValueOnce(
        sse([START, ...textChunks('partial'), outcome(kind, false), FINISH])
      );
      const user = userEvent.setup();
      startPanelIsland();
      await send(user, 'first question');

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain(text);
      expectFailureMessage(alert);
      // ai-chat-v2 T36 (screens.md «Header», unsaved at md and wider): no header bar (the only row is md:hidden), no
      // title.
      const header = document.querySelector(
        '[data-slot="chat-header"]'
      ) as HTMLElement;
      expect(header).toHaveClass('md:hidden', 'h-12');
      expect(header).toHaveTextContent('');
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      await waitFor(() => expect(refresh).toHaveBeenCalled());
      expect(replace).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(
        sse([START, ...textChunks('ok'), outcome('ANSWERED', true), FINISH])
      );
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(bodyOf(1).conversationId).toBeNull();
      expect(bodyOf(1).message.parts[0].text).toBe('first question');
    }
  );

  it('adopts the id only from the late data-conversation (after text) and ends on /ai/{id}', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        allowanceChunk(29),
        START,
        ...textChunks('Nobody yet.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cLate', title: 'Who owes me?' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    startPanelIsland();
    await send(user, 'Who owes me?');
    await waitFor(() =>
      expect(
        replaceState.mock.calls.some((c) => String(c[2]).endsWith('/ai/cLate'))
      ).toBe(true)
    );
    expect(
      replaceState.mock.calls.every((c) => !String(c[2]).endsWith('/ai/null'))
    ).toBe(true);

    fetchMock.mockResolvedValueOnce(
      sse([START, ...textChunks('ok'), outcome('ANSWERED', true), FINISH])
    );
    await waitFor(() =>
      expect((box() as HTMLTextAreaElement).disabled).toBe(false)
    );
    await send(user, 'and Globex?');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).conversationId).toBe('cLate');
  });

  // Fix 2026-10-12 (chat-reloads-on-send): the first reply on /ai used to end with router.replace('/ai/{id}'),
  // a navigation that showed the route's loading skeleton and remounted the chat.
  it('the first reply on /ai is appended in place: no navigation, the card comes from the saved Conversation', async () => {
    const card = { id: 'card1' } as unknown as DraftCardView;
    loadConversationCards.mockResolvedValue({
      success: true,
      data: { cards: { card1: card }, invoiceLinks: {} },
    });
    fetchMock.mockResolvedValueOnce(
      sse([
        allowanceChunk(29),
        START,
        ...textChunks('Here is the draft.'),
        { type: 'data-draft-card', id: 'card1', data: { cardId: 'card1' } },
        {
          type: 'data-conversation',
          data: { conversationId: 'cNew', title: 'Invoice Acme' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    startPanelIsland();
    await send(user, 'Invoice Acme for 20 hours at $50');
    const sent = await screen.findByText('Invoice Acme for 20 hours at $50');
    await waitFor(() =>
      expect((box() as HTMLTextAreaElement).disabled).toBe(false)
    );
    await act(async () => {});

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect((await screen.findByTestId('draft-card')).textContent).toBe(
      'card card1'
    );
    expect(loadConversationCards).toHaveBeenCalledWith('cNew');
    expect(
      replaceState.mock.calls.some((c) => String(c[2]).endsWith('/ai/cNew'))
    ).toBe(true);
    // not remounted: the very same message element is still on screen, under the Conversation's header
    expect(screen.getByText('Invoice Acme for 20 hours at $50')).toBe(sent);
    expect(screen.getByRole('heading', { name: 'Invoice Acme' })).toBeTruthy();
  });

  it('going back to /ai from the new Conversation starts a fresh chat', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Nobody yet.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cNew', title: 'Who owes me?' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const view = startPanelIsland();
    await send(user, 'Who owes me?');
    await screen.findByText('Nobody yet.');
    const props = {
      conversationId: null,
      initialMessages: [],
      invoiceLinks: {},
      cards: {},
      allowance: allowance(29),
    };
    pathname = '/ai/cNew';
    view.rerender(<ChatIsland {...props} />);
    expect(screen.getByText('Nobody yet.')).toBeTruthy();

    pathname = '/ai';
    view.rerender(<ChatIsland {...props} />);
    expect(
      await screen.findByRole('heading', { name: START_GREETING })
    ).toBeTruthy();
    expect(screen.queryByText('Nobody yet.')).toBeNull();
  });
});

describe('T39 R-22 - live regions', () => {
  it('no aria-live around the message list; the finished reply is announced once, after the outcome', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValue(stream.response);
    const user = userEvent.setup();
    const { container } = island();
    const announced = () =>
      Array.from(container.querySelectorAll('[aria-live]')).map(
        (el) => el.textContent ?? ''
      );

    for (const el of Array.from(container.querySelectorAll('[data-role]'))) {
      expect(el.closest('[aria-live]')).toBeNull();
    }

    await send(user, 'status?');
    await act(async () => {
      stream.push(START);
      stream.push({ type: 'text-start', id: 't1' });
      stream.push({ type: 'text-delta', id: 't1', delta: 'Two invoices ' });
    });
    expect(await screen.findByText(/Two invoices/)).toBeTruthy();
    expect(announced().some((t) => t.includes('Two invoices'))).toBe(false);
    for (const el of Array.from(container.querySelectorAll('[data-role]'))) {
      expect(el.closest('[aria-live]')).toBeNull();
    }

    await act(async () => {
      stream.push({ type: 'text-delta', id: 't1', delta: 'are overdue.' });
      stream.push({ type: 'text-end', id: 't1' });
      stream.push(outcome('ANSWERED', true));
      stream.push(FINISH);
      stream.end();
    });
    await waitFor(() =>
      expect(
        container.querySelector('[aria-live="polite"]')?.textContent
      ).toContain('Two invoices are overdue.')
    );
    expect(
      announced().filter((t) => t.includes('Two invoices are overdue.'))
    ).toHaveLength(1);
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });
});

// T39 R-23 (scroll to the newest message on open, on send and while a reply streams) is superseded by ai-chat-v2
// T21's follow-to-latest hook and its 48 px rule: see tests/component/ai-follow-latest.test.tsx.

// ai-chat-v2 T31 finding: a Conversation started in place keeps the /ai page's tree in its history entry. Back then
// Forward to /ai/{id} mounted that page again: the empty start screen under a saved Conversation's address. The
// island now notices it mounted with no Conversation at a Conversation address, shows a skeleton and refreshes, so
// the server renders the saved Conversation.
describe('mounted by /ai at a Conversation address (Back then Forward)', () => {
  it('shows no start screen and refreshes once to load the saved Conversation', async () => {
    pathname = '/ai/cSaved';
    island({ conversationId: null, initialMessages: [] });
    expect(screen.queryByRole('heading', { name: START_GREETING })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it('a new Conversation that moves its own address from /ai to /ai/{id} is not refreshed', async () => {
    pathname = '/ai';
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Saved.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cMoved', title: 'Moved' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const view = island({ conversationId: null, initialMessages: [] });
    await send(userEvent.setup(), 'Who owes me?');
    await screen.findByText('Saved.');
    refresh.mockClear();
    pathname = '/ai/cMoved';
    view.rerender(
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance(12)}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a saved Conversation page (conversationId set) is never refreshed on mount', async () => {
    pathname = '/ai/c1';
    island();
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).not.toHaveBeenCalled();
  });
});

// Review 2026-10-13 R1-U2 (the trade-off of the T31 router fix): the router knows /ai/{id} once the first reply
// saved the Conversation, so its first revalidating server action (normally Create draft) re-renders the address
// as the Conversation page, which mounts a new island. The live chat is handed over to it: an in-flight reply keeps
// streaming, the exchange stays on screen, unsent composer text stays, and nothing is sent again.
describe('the one-time swap to the Conversation page keeps the live chat', () => {
  const conversationPage = () => (
    <div key="conversation-page">
      <ChatIsland
        conversationId="cNew"
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance(28)}
      />
    </div>
  );

  async function firstReply(user: ReturnType<typeof userEvent.setup>) {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('First answer.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cNew', title: 'Who owes me?' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const view = startPanelIsland();
    await send(user, 'Who owes me?');
    await screen.findByText('First answer.');
    await waitFor(() =>
      expect((box() as HTMLTextAreaElement).disabled).toBe(false)
    );
    pathname = '/ai/cNew';
    return view;
  }

  it('a reply in flight during the swap keeps streaming into the new island; nothing is re-sent', async () => {
    const user = userEvent.setup();
    const view = await firstReply(user);
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    await send(user, 'And Globex?');
    stream.push({ type: 'start', messageId: 'msg_srv_2' });
    stream.push({ type: 'text-start', id: 't2' });
    stream.push({ type: 'text-delta', id: 't2', delta: 'Globex owes' });
    await screen.findByText(/Globex owes/);

    view.rerender(conversationPage());

    expect(screen.getByText('First answer.')).toBeTruthy();
    expect(screen.getByText('And Globex?')).toBeTruthy();
    stream.push({ type: 'text-delta', id: 't2', delta: ' 250 EUR.' });
    stream.push({ type: 'text-end', id: 't2' });
    stream.push(outcome('ANSWERED', true));
    stream.push(FINISH);
    stream.end();
    expect(await screen.findByText('Globex owes 250 EUR.')).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // R6-U3: the finished reply refreshes the page once; the takeover check does not add a second one.
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('unsent composer text and the next send carry over; the next send goes to the saved Conversation', async () => {
    const user = userEvent.setup();
    const view = await firstReply(user);
    await user.type(box(), 'unsent words');

    view.rerender(conversationPage());

    expect((box() as HTMLTextAreaElement).value).toBe('unsent words');
    expect(screen.getByText('First answer.')).toBeTruthy();
    fetchMock.mockResolvedValueOnce(
      sse([START, ...textChunks('ok'), outcome('ANSWERED', true), FINISH])
    );
    await user.click(sendBtn());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).conversationId).toBe('cNew');
    expect(bodyOf(1).message.parts[0].text).toBe('unsent words');
  });

  it('a Conversation page opened later (not the swap) starts from the server messages, not a stale live chat', async () => {
    const user = userEvent.setup();
    const view = await firstReply(user);
    // Leave for another Conversation, then come back: the first island is gone for good.
    window.history.replaceState(null, '', '/ai/cOther');
    view.rerender(
      <div key="other">
        <ChatIsland
          conversationId="cOther"
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );
    await new Promise((r) => setTimeout(r, 20));
    view.rerender(
      <div key="back">
        <ChatIsland
          conversationId="cNew"
          initialMessages={[
            {
              id: 's1',
              role: 'user',
              origin: 'TYPED',
              parts: [{ type: 'text', text: 'From the server' }],
              createdAt: '',
            },
          ]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );
    expect(screen.getByText('From the server')).toBeTruthy();
    expect(screen.queryByText('First answer.')).toBeNull();
  });
});

// Review 2026-10-13 R2-U1: the router can show the Conversation page's loading state between the /ai island's
// unmount and the new island's mount. The live chat waits for it while the address is still that Conversation's.
describe('the swap with a loading state in between', () => {
  const page = (key: string) => (
    <div key={key}>
      <ChatIsland
        conversationId="cLoad"
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance(28)}
      />
    </div>
  );

  async function firstReply(user: ReturnType<typeof userEvent.setup>) {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('First answer.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cLoad', title: 'Who owes me?' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const view = startPanelIsland();
    await send(user, 'Who owes me?');
    await screen.findByText('First answer.');
    await waitFor(() =>
      expect((box() as HTMLTextAreaElement).disabled).toBe(false)
    );
    pathname = '/ai/cLoad';
    return view;
  }

  it('a reply that streams and even finishes during the loading state is shown whole, and the page is refreshed', async () => {
    const user = userEvent.setup();
    const view = await firstReply(user);
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    await send(user, 'And Globex?');
    stream.push({ type: 'start', messageId: 'msg_srv_2' });
    stream.push({ type: 'text-start', id: 't2' });
    stream.push({ type: 'text-delta', id: 't2', delta: 'Globex owes' });
    await screen.findByText(/Globex owes/);
    refresh.mockClear();

    view.rerender(<div key="loading">loading…</div>);
    stream.push({ type: 'text-delta', id: 't2', delta: ' 250 EUR.' });
    stream.push({ type: 'text-end', id: 't2' });
    stream.push(outcome('ANSWERED', true));
    stream.push(FINISH);
    stream.end();
    await new Promise((r) => setTimeout(r, 300));
    view.rerender(page('conversation-page'));

    expect(await screen.findByText('Globex owes 250 EUR.')).toBeTruthy();
    expect(screen.getByText('First answer.')).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // R7-1: the replayed finish refreshes once; the takeover check does not add a second refresh.
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('unsent text survives a loading state', async () => {
    const user = userEvent.setup();
    const view = await firstReply(user);
    await user.type(box(), 'still here');
    view.rerender(<div key="loading">loading…</div>);
    await new Promise((r) => setTimeout(r, 300));
    view.rerender(page('conversation-page'));
    expect((box() as HTMLTextAreaElement).value).toBe('still here');
  });
});

// Review 2026-10-13 R2-U3: after "New chat" the /ai page stays mounted; Back to the Conversation started in place
// restores an entry holding that same tree. The island must not show the start screen (or another chat) there.
describe('New chat, then Back to the Conversation started in place', () => {
  it('shows no start screen at /ai/{id} and refreshes to load the saved Conversation', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('First answer.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cBack', title: 'Who owes me?' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const element = () => (
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance(30)}
      />
    );
    const view = render(element());
    await send(user, 'Who owes me?');
    await screen.findByText('First answer.');
    pathname = '/ai/cBack';
    view.rerender(element());
    expect(screen.getByText('First answer.')).toBeTruthy();
    refresh.mockClear();

    pathname = '/ai'; // New chat
    window.history.pushState(null, '', '/ai');
    view.rerender(element());
    expect(screen.queryByText('First answer.')).toBeNull();
    await new Promise((r) => setTimeout(r, 20));

    pathname = '/ai/cBack'; // Back
    window.history.replaceState(null, '', '/ai/cBack');
    view.rerender(element());
    expect(screen.queryByRole('heading', { name: START_GREETING })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

// Review 2026-10-13 R3-U3: a history entry holding the /ai page's tree can be restored at /ai/{id} while that
// Conversation's live chat is still held (by the Conversation page's island, or waiting for one). The /ai page then
// shows that live chat, never the start screen.
describe('the /ai page restored at the address of a live Conversation', () => {
  it('shows the live chat, not the start screen, and does not refresh', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Restored answer.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cRestore', title: 'Restore me' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const view = startPanelIsland();
    await send(user, 'Who owes me?');
    await screen.findByText('Restored answer.');
    pathname = '/ai/cRestore';
    view.rerender(
      <div key="conversation-page">
        <ChatIsland
          conversationId="cRestore"
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );
    expect(screen.getByText('Restored answer.')).toBeTruthy();
    refresh.mockClear();

    view.rerender(
      <div key="ai-page-restored">
        <ChatIsland
          conversationId={null}
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );

    expect(screen.queryByRole('heading', { name: START_GREETING })).toBeNull();
    expect(screen.getByText('Restored answer.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Restore me' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).not.toHaveBeenCalled();
  });
});

// Review 2026-10-13 R4-U1: the /ai page that takes a live chat over at its Conversation's address loads that
// Conversation's cards and choices, instead of leaving their skeletons until the next reply.
describe('the /ai page restored at a live Conversation: cards and choices', () => {
  it('loads the Conversation cards and offers once and shows them', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Here is the draft.'),
        { type: 'data-draft-card', id: 'card1', data: { cardId: 'card1' } },
        { type: 'data-offer', id: 'off1', data: { offerId: 'off1' } },
        {
          type: 'data-conversation',
          data: { conversationId: 'cCards', title: 'With cards' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const view = startPanelIsland();
    await send(user, 'Invoice Acme');
    await screen.findByText('Here is the draft.');
    pathname = '/ai/cCards';
    view.rerender(
      <div key="conversation-page">
        <ChatIsland
          conversationId="cCards"
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );
    loadConversationCards.mockReset();
    loadConversationCards.mockResolvedValue({
      success: true,
      data: {
        cards: { card1: { id: 'card1' } },
        invoiceLinks: {},
        offers: {
          off1: {
            offerId: 'off1',
            kind: 'BANK_ACCOUNT',
            state: 'OPEN',
            chosenOptionId: null,
            options: [{ optionId: 0, label: 'Monobank ••••4821 · USD' }],
          },
        },
      },
    });

    view.rerender(
      <div key="ai-page-restored">
        <ChatIsland
          conversationId={null}
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );

    expect((await screen.findByTestId('draft-card')).textContent).toBe(
      'card card1'
    );
    expect(
      await screen.findByRole('group', { name: 'Choose a bank account' })
    ).toBeTruthy();
    expect(loadConversationCards).toHaveBeenCalledWith('cCards');
    expect(loadConversationCards).toHaveBeenCalledTimes(1);
  });

  // Review 2026-10-13 R5-U1: the row is put back in the list (the restored workspace has a fresh provider).
  it('announces the Conversation to the list of the restored workspace', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Listed again.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cListed', title: 'Listed' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const view = startPanelIsland();
    await send(user, 'Who owes me?');
    await screen.findByText('Listed again.');
    pathname = '/ai/cListed';
    view.rerender(
      <div key="conversation-page">
        <ChatIsland
          conversationId="cListed"
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );
    function Probe() {
      return (
        <span data-testid="created">
          {JSON.stringify(useNewConversation()?.created ?? null)}
        </span>
      );
    }

    view.rerender(
      <div key="ai-page-restored">
        <NewConversationProvider>
          <Probe />
          <ChatIsland
            conversationId={null}
            initialMessages={[]}
            invoiceLinks={{}}
            cards={{}}
            allowance={allowance(28)}
          />
        </NewConversationProvider>
      </div>
    );

    await waitFor(() =>
      expect(
        JSON.parse(screen.getByTestId('created').textContent ?? 'null')
      ).toEqual({ id: 'cListed', title: 'Listed' })
    );
  });
});

// Review 2026-10-13 R5-U2: the Conversation page restored from the router cache can take over a live chat whose newer
// reply holds a card or choices its cached props lack. It refreshes once, so they load.
describe('the Conversation page taking over a chat with newer cards than its props', () => {
  it('refreshes once when the live chat has newer messages than its props', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Here is the draft.'),
        { type: 'data-draft-card', id: 'cardN', data: { cardId: 'cardN' } },
        {
          type: 'data-conversation',
          data: { conversationId: 'cStale', title: 'Stale' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const view = startPanelIsland();
    await send(user, 'Invoice Acme');
    await screen.findByText('Here is the draft.');
    pathname = '/ai/cStale';
    refresh.mockClear();

    view.rerender(
      <div key="cached-conversation-page">
        <ChatIsland
          conversationId="cStale"
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when its props are as new as the live chat', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Here is the draft.'),
        { type: 'data-draft-card', id: 'cardF', data: { cardId: 'cardF' } },
        {
          type: 'data-conversation',
          data: { conversationId: 'cFresh', title: 'Fresh' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const view = startPanelIsland();
    await send(user, 'Invoice Acme');
    await screen.findByText('Here is the draft.');
    pathname = '/ai/cFresh';
    refresh.mockClear();

    view.rerender(
      <div key="fresh-conversation-page">
        <ChatIsland
          conversationId="cFresh"
          initialMessages={[
            {
              id: 's1',
              role: 'user',
              origin: 'TYPED',
              parts: [{ type: 'text', text: 'Invoice Acme' }],
              createdAt: '',
            },
            {
              id: 's2',
              role: 'assistant',
              origin: null,
              parts: [
                { type: 'text', text: 'Here is the draft.' },
                {
                  type: 'data-draft-card',
                  id: 'cardF',
                  data: { cardId: 'cardF' },
                },
              ],
              createdAt: '',
            },
          ]}
          invoiceLinks={{}}
          cards={{ cardF: { id: 'cardF' } as unknown as DraftCardView }}
          allowance={allowance(28)}
        />
      </div>
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).not.toHaveBeenCalled();
  });
});

// Review 2026-10-13 R5-U3: on a phone the list button stays reachable from the first send, also when that send fails.
describe('the phone list button before the Conversation is saved', () => {
  it('shows "Open conversations" while the first message waits and after it fails', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('partial'),
        outcome('COULD_NOT_COMPLETE', false),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    render(
      <AiWorkspace conversations={[]} timeZone="UTC">
        <ChatIsland
          conversationId={null}
          initialMessages={[]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(30)}
        />
      </AiWorkspace>
    );
    await send(user, 'first question');
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Open conversations' })
    ).toBeTruthy();
    // ai-chat-v2 T36 (screens.md «Header», unsaved below md): the h-12 header row holds only the list button.
    const header = document.querySelector(
      '[data-slot="chat-header"]'
    ) as HTMLElement;
    expect(header).toHaveClass('h-12', 'md:hidden');
    expect(header.querySelectorAll('button')).toHaveLength(1);
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'Open conversations' })
    );
  });
});

// Review 2026-10-13 R7-2: a failed reply's messages were never saved, so they do not make the page's props "older".
describe('a swap while a failed reply shows', () => {
  it('does not refresh for the unsaved failed messages', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Saved answer.'),
        {
          type: 'data-conversation',
          data: { conversationId: 'cFailSwap', title: 'Fail swap' },
        },
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    const view = startPanelIsland();
    await send(user, 'Who owes me?');
    await screen.findByText('Saved answer.');
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('partial'),
        outcome('COULD_NOT_COMPLETE', false),
        FINISH,
      ])
    );
    await send(user, 'And Globex?');
    await screen.findByRole('alert');
    pathname = '/ai/cFailSwap';
    refresh.mockClear();

    view.rerender(
      <div key="conversation-page">
        <ChatIsland
          conversationId="cFailSwap"
          initialMessages={[
            {
              id: 's1',
              role: 'user',
              origin: 'TYPED',
              parts: [{ type: 'text', text: 'Who owes me?' }],
              createdAt: '',
            },
            {
              id: 's2',
              role: 'assistant',
              origin: null,
              parts: [{ type: 'text', text: 'Saved answer.' }],
              createdAt: '',
            },
          ]}
          invoiceLinks={{}}
          cards={{}}
          allowance={allowance(28)}
        />
      </div>
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).not.toHaveBeenCalled();
  });
});

// Review 2026-10-13 R7-4: a new message after a failed reply (instead of Try again) does not bring the discarded
// exchange back: the failed message and its partial text stay discarded (parent SCR-02).
describe('sending after a failed reply', () => {
  it('keeps the failed message and its partial reply discarded', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('half an answer'),
        outcome('COULD_NOT_COMPLETE', false),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    island();
    await send(user, 'first try');
    await screen.findByRole('alert');
    expect(screen.queryByText('half an answer')).toBeNull();

    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('A fresh answer.'),
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    await send(user, 'second try');
    await screen.findByText('A fresh answer.');

    expect(screen.queryByText('half an answer')).toBeNull();
    expect(screen.queryByText('first try')).toBeNull();
    expect(screen.getByText('second try')).toBeTruthy();
  });

  // Review 2026-10-13 R8-2: pressing an option while a typed failure shows still sends the choice, and the failed
  // exchange stays discarded, also when that press is refused (409).
  const withOffer = () =>
    island({
      initialMessages: [
        {
          id: 'm1',
          role: 'user',
          origin: 'TYPED',
          parts: [{ type: 'text', text: 'invoice Acme' }],
          createdAt: '',
        },
        {
          id: 'm2',
          role: 'assistant',
          origin: null,
          parts: [
            { type: 'text', text: 'Which one?' },
            { type: 'data-offer', id: 'off1', data: { offerId: 'off1' } },
          ],
          createdAt: '',
        },
      ],
      offers: {
        off1: {
          offerId: 'off1',
          kind: 'CUSTOMER',
          state: 'OPEN',
          chosenOptionId: null,
          options: [
            { optionId: 0, label: 'Acme Corp' },
            { optionId: 1, label: 'Acme GmbH' },
          ],
        },
      },
    });

  it('a press after a typed failure sends its choice and keeps the failed exchange discarded', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('half an answer'),
        outcome('COULD_NOT_COMPLETE', false),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    withOffer();
    await send(user, 'never mind');
    await screen.findByRole('alert');

    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('Draft for Acme GmbH.'),
        outcome('ANSWERED', true),
        FINISH,
      ])
    );
    await user.click(screen.getByRole('button', { name: 'Acme GmbH' }));
    await screen.findByText('Draft for Acme GmbH.');

    expect((bodyOf(1) as unknown as { choice: unknown }).choice).toEqual({
      offerId: 'off1',
      optionId: 1,
    });
    expect(screen.queryByText('never mind')).toBeNull();
    expect(screen.queryByText('half an answer')).toBeNull();
  });

  it('a refused press (409) after a typed failure shows the notice, no Try again, and nothing discarded comes back', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        START,
        ...textChunks('half an answer'),
        outcome('COULD_NOT_COMPLETE', false),
        FINISH,
      ])
    );
    const user = userEvent.setup();
    withOffer();
    await send(user, 'never mind');
    await screen.findByRole('alert');

    const notice =
      'This option is no longer available. Choose again or type your request.';
    fetchMock.mockResolvedValueOnce(
      json(409, {
        success: false,
        code: 'CONFLICT',
        error: notice,
        details: { kind: 'CHOICE_UNAVAILABLE' },
      })
    );
    await user.click(screen.getByRole('button', { name: 'Acme GmbH' }));

    expect(await screen.findByText(notice)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText('never mind')).toBeNull();
    expect(screen.queryByText('half an answer')).toBeNull();
  });
});
