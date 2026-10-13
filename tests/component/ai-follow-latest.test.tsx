// @vitest-environment jsdom
// T21 (ai-chat-v2; AC-16, spec §6 "Follow-to-latest", screens.md §SCR-03 "Following new text"): while the end of the
// messages is no more than 48 px out of view, each new delta keeps the newest text in view within 100 ms; further up
// nothing moves and a "Jump to latest" control appears; pressing it returns to the end and hides it.
//
// jsdom has no layout, so the chat scroll area ([data-slot="chat-scroll"]) is given one here: a 400 px view whose
// content grows with the text it holds (2 px per character + 400 px of chrome), and a clamped scrollTop.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
}));
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadConversationCards: vi.fn(async () => ({
    success: true,
    data: { cards: {}, invoiceLinks: {}, offers: {} },
  })),
}));
vi.mock('@/components/ai/draft-card', () => ({ DraftCard: () => <div /> }));

import { ChatIsland } from '@/components/ai/chat-island';
import type { ConversationMessageView } from '@/types/assistant/types';

const VIEW = 400;
const scrollTops = new WeakMap<Element, number>();
const isScroll = (el: Element) =>
  (el as HTMLElement).dataset?.slot === 'chat-scroll';
/** Extra height of reflowed content (a narrower pane, an image that loaded). */
let extra = 0;
const contentHeight = (el: Element) => VIEW + (el.textContent?.length ?? 0) * 2 + extra;
const maxTop = (el: Element) => Math.max(0, contentHeight(el) - VIEW);
const scrollToSpy = vi.fn();

const originals = {
  scrollHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
  ),
  clientHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight'
  ),
  scrollTop: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollTop'
  ),
  scrollTo: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo'),
};

function installLayout() {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroll(this) ? contentHeight(this) : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroll(this) ? VIEW : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrollTops.set(
        this,
        Math.min(Math.max(0, value), isScroll(this) ? maxTop(this) : 0)
      );
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      scrollToSpy(options);
      this.scrollTop = options.top ?? 0;
    },
  });
}
function restoreLayout() {
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
}

let reducedMotion = false;
function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
  );
}

const enc = new TextEncoder();
const sseHeaders = {
  'content-type': 'text/event-stream',
  'x-vercel-ai-ui-message-stream': 'v1',
};
function openStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: sseHeaders }),
    push: (c: unknown) =>
      ctrl.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`)),
    end: () => {
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  };
}
const fetchMock = vi.fn();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LONG =
  'An earlier reply that is long enough to push the end of the messages well below the view. '.repeat(
    6
  );
const history: ConversationMessageView[] = [
  {
    id: 'm1',
    role: 'user',
    origin: 'TYPED',
    parts: [{ type: 'text', text: 'Who owes me money?' }],
    createdAt: '',
  },
  {
    id: 'm2',
    role: 'assistant',
    origin: null,
    parts: [{ type: 'text', text: LONG }],
    createdAt: '',
  },
];

function island() {
  return render(
    <ChatIsland
      conversationId="c1"
      initialMessages={history}
      invoiceLinks={{}}
      cards={{}}
      allowance={{
        limit: 30,
        used: 2,
        left: 28,
        renewsAt: '2026-10-14T00:00:00.000Z',
        timeZone: 'UTC',
      }}
    />
  );
}
const scroller = () =>
  document.querySelector('[data-slot="chat-scroll"]') as HTMLElement;
const atEnd = () => scroller().scrollTop === maxTop(scroller());
const jump = () => screen.queryByRole('button', { name: 'Jump to latest' });

/** Sends a message and starts a reply; returns the open stream. */
async function startReply() {
  const stream = openStream();
  fetchMock.mockResolvedValueOnce(stream.response);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Message' }),
    'And who is overdue?'
  );
  await user.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  stream.push({ type: 'start', messageId: 'srv1' });
  stream.push({ type: 'text-start', id: 't1' });
  return stream;
}
const WORDS =
  'Acme Corp owes you 100.00 USD and Globex owes you 250.00 EUR since last month. '.split(
    ' '
  );

beforeEach(() => {
  extra = 0;
  installLayout();
  reducedMotion = false;
  stubMatchMedia();
  scrollToSpy.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  restoreLayout();
  vi.unstubAllGlobals();
});

describe('Following new text (AC-16)', () => {
  it('a reopened Conversation opens scrolled to the newest message', async () => {
    island();
    expect(maxTop(scroller())).toBeGreaterThan(0);
    await waitFor(() => expect(atEnd()).toBe(true));
    expect(jump()).toBeNull();
  });

  it('at the bottom, each streamed delta is in view within 100 ms', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const stream = await startReply();
    let sofar = '';
    for (const word of WORDS) {
      sofar += `${word} `;
      stream.push({ type: 'text-delta', id: 't1', delta: `${word} ` });
      // The delta is shown and the end is in view within 100 ms of it arriving.
      await waitFor(
        () => {
          expect(scroller().textContent).toContain(sofar.trim());
          expect(atEnd()).toBe(true);
        },
        { timeout: 100 }
      );
      await pause(25);
    }
    expect(jump()).toBeNull();
    stream.push({ type: 'text-end', id: 't1' });
    stream.push({ type: 'finish' });
    stream.end();
  });

  it('within 48 px of the end still counts as at the bottom and keeps following', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const stream = await startReply();
    stream.push({ type: 'text-delta', id: 't1', delta: 'Acme ' });
    await waitFor(() => expect(atEnd()).toBe(true), { timeout: 100 });
    const el = scroller();
    el.scrollTop = maxTop(el) - 48;
    fireEvent.scroll(el);
    expect(jump()).toBeNull();
    stream.push({
      type: 'text-delta',
      id: 't1',
      delta: 'Corp owes you a lot. ',
    });
    await waitFor(() => expect(atEnd()).toBe(true), { timeout: 100 });
    stream.end();
  });

  it('scrolled further up: 0 position changes while streaming, and the jump control appears', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const stream = await startReply();
    stream.push({ type: 'text-delta', id: 't1', delta: 'Acme ' });
    await waitFor(() => expect(atEnd()).toBe(true), { timeout: 100 });

    const el = scroller();
    el.scrollTop = maxTop(el) - 49;
    fireEvent.scroll(el);
    const kept = el.scrollTop;
    expect(
      await screen.findByRole('button', { name: 'Jump to latest' })
    ).toBeTruthy();

    const positions: number[] = [];
    for (const word of WORDS) {
      stream.push({ type: 'text-delta', id: 't1', delta: `${word} ` });
      await pause(25);
      positions.push(el.scrollTop);
    }
    await waitFor(() => expect(el.textContent).toContain('since last month.'));
    expect(positions.every((p) => p === kept)).toBe(true);
    expect(el.scrollTop).toBe(kept);
    expect(jump()).toBeTruthy();
    stream.end();
  });

  it('"Jump to latest" is keyboard reachable, returns to the end and hides; following resumes', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const el = scroller();
    el.scrollTop = 0;
    fireEvent.scroll(el);
    const button = await screen.findByRole('button', {
      name: 'Jump to latest',
    });
    button.focus();
    expect(document.activeElement).toBe(button);
    const user = userEvent.setup();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(atEnd()).toBe(true));
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' })
    );
    fireEvent.scroll(el);
    await waitFor(() => expect(jump()).toBeNull());

    const stream = await startReply();
    stream.push({ type: 'text-delta', id: 't1', delta: 'Following again. ' });
    await waitFor(() => expect(atEnd()).toBe(true), { timeout: 100 });
    stream.end();
  });

  it('scrolling back within 48 px hides the control', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const el = scroller();
    el.scrollTop = 0;
    fireEvent.scroll(el);
    expect(
      await screen.findByRole('button', { name: 'Jump to latest' })
    ).toBeTruthy();
    el.scrollTop = maxTop(el) - 20;
    fireEvent.scroll(el);
    await waitFor(() => expect(jump()).toBeNull());
  });

  it('sending a message always scrolls to the bottom, even from further up', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const el = scroller();
    el.scrollTop = 0;
    fireEvent.scroll(el);
    await screen.findByRole('button', { name: 'Jump to latest' });
    const stream = await startReply();
    await waitFor(() => expect(atEnd()).toBe(true), { timeout: 100 });
    stream.push({ type: 'text-delta', id: 't1', delta: 'Back at the end. ' });
    await waitFor(() => expect(atEnd()).toBe(true), { timeout: 100 });
    await waitFor(() => expect(jump()).toBeNull());
    stream.end();
  });

  it('under reduced motion the jump is instant (no smooth scroll)', async () => {
    reducedMotion = true;
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const el = scroller();
    el.scrollTop = 0;
    fireEvent.scroll(el);
    const button = await screen.findByRole('button', {
      name: 'Jump to latest',
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(atEnd()).toBe(true);
    expect(scrollToSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' })
    );
  });
});

// Review 2026-10-13 R1-U4: content that grows with no new message (a Draft card replacing its skeleton after the
// reply, Offered-choice labels replacing theirs) is followed too, and further up it shows the jump control.
describe('Following content that grows after the stream (AC-16)', () => {
  const grow = (el: HTMLElement, chars: number) => {
    const block = document.createElement('div');
    block.textContent = 'x'.repeat(chars);
    el.appendChild(block);
  };

  it('at the bottom, a card that grows the content by more than 48 px is followed', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const el = scroller();
    grow(el, 200); // 400 px taller
    await waitFor(() => expect(atEnd()).toBe(true), { timeout: 100 });
    expect(jump()).toBeNull();
  });

  it('further up, growing content moves nothing and the jump control stays', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const el = scroller();
    el.scrollTop = maxTop(el) - 49;
    fireEvent.scroll(el);
    const kept = el.scrollTop;
    expect(await screen.findByRole('button', { name: 'Jump to latest' })).toBeTruthy();
    grow(el, 200);
    await pause(50);
    expect(el.scrollTop).toBe(kept);
    expect(jump()).toBeTruthy();
  });
});

// Review 2026-10-13 (round 2 e2e, AC-20): opening the preview narrows the chat pane, so its content reflows taller.
// That is not new content: the view stays where it is (the Freelancer's messages stay beside the preview). Content
// that grows at the same width is still followed.
describe('a resize of the chat pane is not new content', () => {
  let observers: Array<{ cb: ResizeObserverCallback }> = [];
  let width = 600;
  beforeEach(() => {
    observers = [];
    width = 600;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(readonly cb: ResizeObserverCallback) {
          observers.push(this);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return isScroll(this) ? width : 0;
      },
    });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  });
  const fire = () => act(() => observers.forEach((o) => o.cb([], o as unknown as ResizeObserver)));

  it('a narrower pane whose content reflows taller keeps its position', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    const el = scroller();
    const before = el.scrollTop;
    width = 400; // the preview column opened
    extra = 300; // the same content, reflowed taller
    fire();
    expect(el.scrollTop).toBe(before);
  });

  it('content that grows at the same width is followed', async () => {
    island();
    await waitFor(() => expect(atEnd()).toBe(true));
    extra = 300; // an image or a card grew
    fire();
    expect(atEnd()).toBe(true);
  });
});
