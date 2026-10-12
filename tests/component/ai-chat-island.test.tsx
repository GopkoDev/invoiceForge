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
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const router = { push, refresh, replace };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/ai',
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

vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: vi.fn(),
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));
vi.mock('@/components/ai/draft-card', () => ({
  DraftCard: ({ card }: { card: { id: string } }) => <div data-testid="draft-card">{`card ${card.id}`}</div>,
}));

const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  getConversation: (...a: unknown[]) => getConversation(...a),
  listConversations: async () => ({ success: true, data: { items: [], page: 1, pageCount: 1 } }),
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({ success: true, data: { userId: 'u1', timeZone: 'UTC' } }),
}));
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: async () => ({
    success: true,
    data: { limit: 30, used: 12, left: 18, renewsAt: '2026-10-13T00:00:00.000Z', timeZone: 'UTC' },
  }),
}));

import { ChatIsland } from '@/components/ai/chat-island';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { DraftCardView } from '@/types/assistant/types';

const TOO_LONG = 'Messages can be at most 2,000 characters. Shorten it and send again.';
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
const allowanceChunk = (left: number) => ({ type: 'data-allowance', transient: true, data: allowance(left) });
const outcome = (o: string, counted: boolean) => ({ type: 'data-outcome', data: { outcome: o, counted } });
const textChunks = (text: string) => [
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
];
const START = { type: 'start', messageId: 'msg_srv_1' };
const FINISH = { type: 'finish' };

const enc = new TextEncoder();
const frame = (c: unknown) => enc.encode(`data: ${JSON.stringify(c)}\n\n`);
const sseHeaders = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' };

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: sseHeaders });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
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
    message: { id: string; role: string; parts: Array<{ type: string; text: string }> };
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
          parts: [{ type: 'text', text: 'Who owes me money?' }],
          createdAt: '2026-10-12T10:00:00.000Z',
        },
        {
          id: 'm2',
          role: 'assistant',
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

const box = () => screen.getByRole('textbox', { name: 'Message' });
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
  replaceState.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('T33 ChatIsland - request shape', () => {
  it('posts only the new message and the conversationId, never the history', async () => {
    fetchMock.mockResolvedValue(sse([START, ...textChunks('ok'), outcome('ANSWERED', true), FINISH]));
    const user = userEvent.setup();
    island();
    await send(user, "What's overdue today?");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat');
    const body = bodyOf(0);
    expect(body.conversationId).toBe('c1');
    expect(body.message.role).toBe('user');
    expect(body.message.parts).toEqual([{ type: 'text', text: "What's overdue today?" }]);
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
    expect(await screen.findByText('You have two overdue invoices.')).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect((box() as HTMLTextAreaElement).disabled).toBe(false));
  });
});

describe('T33 ChatIsland - AC-09 answered keeps the counter live', () => {
  it('18 sent today -> after one more the chat shows 11 messages left', async () => {
    fetchMock.mockResolvedValue(
      sse([allowanceChunk(11), START, ...textChunks('Two are overdue.'), outcome('ANSWERED', true), FINISH])
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
      sse([allowanceChunk(11), START, ...textChunks(reply), outcome('PARTIAL', true), FINISH])
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
      .mockResolvedValueOnce(sse([allowanceChunk(11), START, ...textChunks('Done now.'), outcome('ANSWERED', true), FINISH]));
    const user = userEvent.setup();
    island({ allowance: allowance(12) });
    await send(user, 'Who is late?');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(COULD_NOT);
    expect(screen.queryByText(/Half an answ/)).toBeNull();
    expect(screen.getByText('12 of 30 messages left today')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).message.parts[0].text).toBe('Who is late?');
    expect(bodyOf(1).message.id).not.toBe(bodyOf(0).message.id);
    expect(await screen.findByText('Done now.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('11 of 30 messages left today')).toBeTruthy();
  });

  it('503 FAILED before the stream shows the same alert with Try again', async () => {
    fetchMock.mockResolvedValue(json(503, { success: false, code: 'FAILED', error: COULD_NOT }));
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
      sse([allowanceChunk(11), outcome('AI_UNAVAILABLE', false), allowanceChunk(12), FINISH])
    );
    const user = userEvent.setup();
    island({ allowance: allowance(12) });
    await send(user, 'Who is late?');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(UNAVAILABLE);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText('12 of 30 messages left today')).toBeTruthy();
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
      json(429, { success: false, code: 'RATE_LIMITED', error: USED_UP_TEXT, details: allowance(0) })
    );
    const user = userEvent.setup();
    island({ allowance: allowance(1) });
    await send(user, 'second tab message');

    expect(await screen.findByText(USED_UP_TEXT)).toBeTruthy();
    expect(screen.queryByText('second tab message')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Connect your own AI client →' })).toBeTruthy();
    expect(screen.getByText('Acme owes you 100.')).toBeTruthy();
  });
});

describe('T33 ChatIsland - conversation-gone and signed out', () => {
  it('404 NOT_FOUND shows the alert with a link to /ai and disables the composer', async () => {
    fetchMock.mockResolvedValue(json(404, { success: false, code: 'NOT_FOUND', error: GONE }));
    const user = userEvent.setup();
    island();
    await send(user, 'hello');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(GONE);
    const link = screen.getByRole('link', { name: 'Start a new conversation →' });
    expect(link.getAttribute('href')).toBe('/ai');
    expect((box() as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('401 on send goes through goToSignIn', async () => {
    fetchMock.mockResolvedValue(json(401, { success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' }));
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
    expect((await screen.findByTestId('draft-card')).textContent).toBe('card card1');
    expect(screen.getByRole('link', { name: 'Sender profiles →' })).toBeTruthy();
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
    expect(screen.getByText('Ask about your invoices')).toBeTruthy();
    await send(user, 'Who owes me money right now?');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).conversationId).toBeNull();
    expect(await screen.findByText('Who owes me money right now?')).toBeTruthy();
    expect(screen.getByText('Thinking…')).toBeTruthy();

    await act(async () => {
      stream.push({ type: 'data-conversation', data: { conversationId: 'cNew', title: 'Who owes me money right now?' } });
      stream.push(allowanceChunk(29));
      stream.push(START);
      stream.push({ type: 'text-start', id: 't1' });
      stream.push({ type: 'text-delta', id: 't1', delta: 'Nobody yet.' });
    });
    await waitFor(() =>
      expect(replaceState.mock.calls.some((c) => String(c[2]).endsWith('/ai/cNew'))).toBe(true)
    );
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // not remounted: the user message and the streaming reply are both still on screen
    expect(screen.getByText('Who owes me money right now?')).toBeTruthy();
    expect(await screen.findByText(/Nobody yet\./)).toBeTruthy();
    expect(screen.getByText('29 of 30 messages left today')).toBeTruthy();

    await act(async () => {
      stream.push({ type: 'text-end', id: 't1' });
      stream.push(outcome('ANSWERED', true));
      stream.push(FINISH);
      stream.end();
    });
    await waitFor(() => expect((box() as HTMLTextAreaElement).disabled).toBe(false));

    fetchMock.mockResolvedValueOnce(sse([START, ...textChunks('ok'), outcome('ANSWERED', true), FINISH]));
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
            parts: [{ type: 'text', text: 'Who owes me money?' }],
            createdAt: '2026-10-12T10:00:00.000Z',
          },
        ],
        invoiceLinks: {},
        cards: {},
      },
    });
    render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
    expect(screen.getByText('Who owes me money?', { selector: 'p' })).toBeTruthy();
    expect(box()).toBeTruthy();
    expect(screen.getByText('18 of 30 messages left today')).toBeTruthy();
  });
});
