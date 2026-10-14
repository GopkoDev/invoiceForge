// @vitest-environment jsdom
// T22 (ai-assistant; AC-01, AC-10, AC-33, AC-34) - SCR-01 start panel: default, example picked,
// start=draft, used-up, used-up from Create with AI; and the /ai page wiring.
// See docs/features/ai-assistant/tasks/t22-ai-start-panel-and-allowance-notice.md and screens.md §SCR-01.
//
// Seams the implementer must provide:
//   components/ai/start-panel.tsx -> export function StartPanel(props: {
//     state: AllowanceState; start?: 'draft'; onSend: (text: string) => void })   ('use client')
//     default: heading "Ask about your invoices", four example Buttons, a textbox (placeholder
//       "Ask a question or describe an invoice"), a "Send" button, the counter, link
//       "Connect your own AI client →" -> /settings/assistants.
//     start=draft: heading "Draft an invoice", placeholder `e.g. "Invoice Acme for 20 hours of consulting at $50"`,
//       ONE example button "Invoice Acme for 20 hours of consulting at $50", composer focused on arrival.
//     left = 0: textbox, Send and examples are gone; AllowanceNotice used-up mode; start=draft adds
//       "Create it by hand →" -> /invoices/new.
//     clicking an example fills the textbox, focuses it, and never calls onSend.
//   app/(protected)/ai/page.tsx -> also reads getAllowanceState(actor) (unwraps failures, throws) and
//     `start` from searchParams ('draft' only; any other value = navigation); renders the panel beside the list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai',
  useSelectedLayoutSegment: () => null,
  useSearchParams: () => new URLSearchParams(),
}));

const listConversationSummaries = vi.fn();
const getAllowanceState = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  listConversationSummaries: (...a: unknown[]) =>
    listConversationSummaries(...a),
}));
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: (...a: unknown[]) => getAllowanceState(...a),
}));
vi.mock('@/lib/helpers/account-name', () => ({
  sessionAccountName: async () => 'Dmytro Hopko',
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({
    success: true,
    data: { userId: 'u1', timeZone: 'Europe/Kyiv' },
  }),
}));

import { StartPanel } from '@/components/ai/start-panel';
import AiPage from '@/app/(protected)/ai/page';
import AiLayout from '@/app/(protected)/ai/layout';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

// ai-chat-v2 T20 (screens.md §SCR-02): the fixed suggested requests, incl. drafting and who owes money.
const EXAMPLES = [
  'Invoice Acme for 20 hours of consulting at $50',
  'Who owes me money right now?',
  "What's overdue today?",
  'Which bank accounts do I have?',
];
// ai-chat-v2 T37 (screens.md §SCR-02 «Greeting»): a two-line h1, line 1 from the Freelancer's local time and first
// name (computed on the server), line 2 with the accent span. The first build's sub-line is dropped.
const LINE1 = 'Good morning, Dmytro';
const GREETING = `${LINE1} How can I help with your invoices today?`;
const DRAFT_GREETING = `${LINE1} Let's draft an invoice.`;
// The /ai page at 10:00 UTC for a Freelancer in Europe/Kyiv (13:00): the afternoon line with the session's first name.
const PAGE_GREETING =
  'Good afternoon, Dmytro How can I help with your invoices today?';
const PAGE_DRAFT_GREETING = "Good afternoon, Dmytro Let's draft an invoice.";
const LINE2 = /How can I help with your invoices today\?/;
const OLD_SUBLINE =
  'Ask about your invoices, Customers and payments, or describe an invoice to draft.';
const DRAFT_EXAMPLE = 'Invoice Acme for 20 hours of consulting at $50';
const DRAFT_PLACEHOLDER = `e.g. "${DRAFT_EXAMPLE}"`;

function state(over: Partial<AllowanceState> = {}): AllowanceState {
  return {
    limit: 30,
    used: 1,
    left: 29,
    renewsAt: '2026-10-12T21:00:00.000Z',
    timeZone: 'Europe/Kyiv',
    ...over,
  } as AllowanceState;
}
const usedUp = () => state({ used: 30, left: 0 });

function reducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  listConversationSummaries.mockReset();
  getAllowanceState.mockReset();
  reducedMotion(false);
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

vi.mock('@/lib/actions/assistant-actions', () => ({
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
  loadConversationCards: async () => ({
    success: true,
    data: { cards: {}, invoiceLinks: {}, forms: {} },
  }),
}));

describe('StartPanel - default (AC-18, SCR-02)', () => {
  it('centres a greeting, the composer, the counter under it and four suggested requests', () => {
    const { container } = render(
      <StartPanel greeting={LINE1} state={state()} onSend={() => {}} />
    );
    const heading = screen.getByRole('heading', { level: 1, name: GREETING });
    expect(
      heading.querySelector('[data-slot="greeting-accent"]')
    ).toHaveTextContent('your invoices today?');
    expect(screen.queryByText(OLD_SUBLINE)).not.toBeInTheDocument();
    // Suggestions are chips (rounded-full) in a wrapping row under the composer.
    for (const ex of EXAMPLES)
      expect(screen.getByRole('button', { name: ex })).toHaveClass(
        'rounded-full'
      );
    expect(
      screen
        .getByRole('button', { name: EXAMPLES[0] })
        .closest('[data-slot="suggestions"]')
    ).toHaveClass('flex-wrap');
    // The composer is the PromptInput card with the counter in its footer and a round Send.
    const card = container.querySelector(
      '[data-slot="prompt-input-card"]'
    ) as HTMLElement;
    expect(card).toHaveClass('rounded-2xl');
    expect(card).toContainElement(
      screen.getByText('29 of 30 messages left today')
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass(
      'rounded-full'
    );
    const box = screen.getByRole('textbox', { name: 'Message' });
    expect(box).toHaveAttribute(
      'placeholder',
      'Ask a question or describe an invoice'
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    const counter = screen.getByText('29 of 30 messages left today');
    expect(
      box.compareDocumentPosition(counter) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      counter.compareDocumentPosition(
        screen.getByRole('button', { name: EXAMPLES[0] })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/justify-center/);
    expect(root.className).toMatch(/items-center/);
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(
      screen.queryByText("You've used today's 30 messages")
    ).not.toBeInTheDocument();
  });

  it('passes the typed text to onSend when Send is pressed, and on Enter', async () => {
    const onSend = vi.fn();
    render(<StartPanel greeting={LINE1} state={state()} onSend={onSend} />);
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Message' }),
      'Hello there'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('Hello there');
  });
});

describe('StartPanel - suggestion picked (AC-18)', () => {
  it('only fills the composer and focuses it; nothing is sent', async () => {
    const onSend = vi.fn();
    render(<StartPanel greeting={LINE1} state={state()} onSend={onSend} />);
    await userEvent.click(
      screen.getByRole('button', { name: "What's overdue today?" })
    );
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe("What's overdue today?");
    expect(box).toHaveFocus();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('StartPanel - start=draft', () => {
  it('shows the draft greeting, the example placeholder and suggestion 1 only', () => {
    render(
      <StartPanel
        greeting={LINE1}
        state={state()}
        start="draft"
        onSend={() => {}}
      />
    );
    const heading = screen.getByRole('heading', {
      level: 1,
      name: DRAFT_GREETING,
    });
    expect(
      heading.querySelector('[data-slot="greeting-accent"]')
    ).toHaveTextContent('an invoice.');
    expect(
      screen.getByText(
        "Describe it in one sentence. You'll see a card to check before anything is created."
      )
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(DRAFT_PLACEHOLDER)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: DRAFT_EXAMPLE })
    ).toBeInTheDocument();
    for (const ex of EXAMPLES.slice(1))
      expect(
        screen.queryByRole('button', { name: ex })
      ).not.toBeInTheDocument();
    expect(
      screen.getByText('29 of 30 messages left today')
    ).toBeInTheDocument();
  });

  it('fills the composer from the chip without sending', async () => {
    const onSend = vi.fn();
    render(
      <StartPanel
        greeting={LINE1}
        state={state()}
        start="draft"
        onSend={onSend}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: DRAFT_EXAMPLE }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      DRAFT_EXAMPLE
    );
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('StartPanel - used-up (parent AC-10)', () => {
  it('keeps the greeting and replaces the composer and suggestions with the used-up notice, no hand-made link', () => {
    render(<StartPanel greeting={LINE1} state={usedUp()} onSend={() => {}} />);
    expect(screen.getByRole('heading', { name: GREETING })).toBeInTheDocument();
    expect(
      screen.getByText("You've used today's 30 messages")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/They renew at 00:00 your time\./)
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send' })
    ).not.toBeInTheDocument();
    for (const ex of EXAMPLES)
      expect(
        screen.queryByRole('button', { name: ex })
      ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Connect your own AI client →' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create it by hand →' })
    ).not.toBeInTheDocument();
  });
});

describe('StartPanel - used-up from Create with AI', () => {
  it('shows the notice and "Create it by hand →" to /invoices/new before anything is typed', () => {
    render(
      <StartPanel
        greeting={LINE1}
        state={usedUp()}
        start="draft"
        onSend={() => {}}
      />
    );
    expect(
      screen.getByText("You've used today's 30 messages")
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create it by hand →' })
    ).toHaveAttribute('href', '/invoices/new');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: DRAFT_EXAMPLE })
    ).not.toBeInTheDocument();
  });

  // Review R16-3 / T45 (screens.md SCR-02 used-up wireframe): nothing can be sent, so no drafting invitation.
  it('keeps the default line 2 and shows no drafting sub-line', () => {
    render(
      <StartPanel
        greeting={LINE1}
        state={usedUp()}
        start="draft"
        onSend={() => {}}
      />
    );
    expect(
      screen.getByRole('heading', { level: 1, name: GREETING })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Let's draft/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Describe it in one sentence/)
    ).not.toBeInTheDocument();
  });
});

describe('StartPanel - greeting slot (T45, R16-11)', () => {
  it('line 1 of the greeting is data-slot="greeting-line"', () => {
    const { container } = render(
      <StartPanel greeting={LINE1} state={state()} onSend={() => {}} />
    );
    expect(
      container.querySelector('h1 [data-slot="greeting-line"]')
    ).toHaveTextContent(LINE1);
  });
});

describe('StartPanel - styling (fix 2026-10-14)', () => {
  const ACCENT = [
    'animate-gradient-shift',
    'bg-linear-to-r',
    'from-violet-600',
    'via-fuchsia-500',
    'to-pink-600',
    'bg-clip-text',
    'text-transparent',
    'dark:from-cyan-400',
    'dark:via-purple-400',
    'dark:to-pink-400',
  ];

  it.each([[undefined], ['draft' as const]])(
    'the greeting accent uses the Tailwind gradient utilities (start=%s)',
    (start) => {
      const { container } = render(
        <StartPanel
          greeting={LINE1}
          state={state()}
          start={start}
          onSend={() => {}}
        />
      );
      const accent = container.querySelector(
        '[data-slot="greeting-accent"]'
      ) as HTMLElement;
      expect(accent).not.toBeNull();
      for (const c of ACCENT) expect(accent).toHaveClass(c);
      expect(accent).not.toHaveClass('ai-greeting-accent');
    }
  );

  it('wraps the composer card in a rounded neon border with the gradient layer', () => {
    const { container } = render(
      <StartPanel greeting={LINE1} state={state()} onSend={() => {}} />
    );
    const neon = container.querySelector(
      '[data-slot="start-composer"] [data-slot="start-composer-neon"]'
    ) as HTMLElement;
    expect(neon).not.toBeNull();
    expect(neon).toHaveClass('rounded-2xl');
    expect(
      neon.querySelector('[data-slot="prompt-input-card"]')
    ).not.toBeNull();
    const layer = Array.from(neon.children).find((el) =>
      el.classList.contains('animate-gradient-shift')
    );
    expect(layer).toBeDefined();
  });

  it('has no neon border when the allowance is used up', () => {
    const { container } = render(
      <StartPanel greeting={LINE1} state={usedUp()} onSend={() => {}} />
    );
    expect(
      container.querySelector('[data-slot="start-composer-neon"]')
    ).toBeNull();
  });
});

describe('AI page wiring', () => {
  const emptyPage = { items: [], timeZone: 'UTC' };

  beforeEach(() => {
    listConversationSummaries.mockResolvedValue({
      success: true,
      data: emptyPage,
    });
  });

  it('reads the allowance of the signed-in freelancer and renders the default panel', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: state() });
    const ui = await AiPage({ searchParams: Promise.resolve({}) });
    expect(getAllowanceState).toHaveBeenCalledWith({
      userId: 'u1',
      timeZone: 'Europe/Kyiv',
    });
    render(ui);
    expect(
      screen.getByRole('heading', { name: PAGE_GREETING })
    ).toBeInTheDocument();
    expect(
      screen.getByText('29 of 30 messages left today')
    ).toBeInTheDocument();
  });

  it('renders the draft variant for ?start=draft', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: state() });
    render(await AiPage({ searchParams: Promise.resolve({ start: 'draft' }) }));
    expect(
      screen.getByRole('heading', { name: PAGE_DRAFT_GREETING })
    ).toBeInTheDocument();
  });

  it('treats an unknown start value as navigation', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: state() });
    render(await AiPage({ searchParams: Promise.resolve({ start: 'bogus' }) }));
    expect(
      screen.getByRole('heading', { name: PAGE_GREETING })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Let's draft/)).not.toBeInTheDocument();
  });

  it('keeps the list readable and shows the used-up notice when nothing is left', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: usedUp() });
    listConversationSummaries.mockResolvedValue({
      success: true,
      data: {
        ...emptyPage,
        items: [
          {
            id: 'c1',
            title: 'Who owes me money?',
            lastMessageAt: '2026-10-10T09:00:00.000Z',
          },
        ],
      },
    });
    // ai-chat-v2 T66 (ADR-0013): the list is the layout's; the page renders inside it.
    render(
      await AiLayout({
        children: await AiPage({ searchParams: Promise.resolve({}) }),
      })
    );
    expect(
      screen.getByText("You've used today's 30 messages")
    ).toBeInTheDocument();
    // ai-chat-v2 T19: one list (the md+ pane); the phone sheet renders only when opened.
    const rows = screen.getAllByRole('link', { name: /Who owes me money\?/ });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('href', '/ai/c1');
    expect(
      screen.queryByRole('link', { name: 'Create it by hand →' })
    ).not.toBeInTheDocument();
  });

  it('adds the hand-made link when used up via ?start=draft', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: usedUp() });
    render(await AiPage({ searchParams: Promise.resolve({ start: 'draft' }) }));
    expect(
      screen.getByRole('link', { name: 'Create it by hand →' })
    ).toHaveAttribute('href', '/invoices/new');
  });

  it('routes a failed allowance read to the error boundary by throwing', async () => {
    getAllowanceState.mockResolvedValue({
      success: false,
      code: 'FAILED',
      error: 'boom',
    });
    await expect(
      AiPage({ searchParams: Promise.resolve({}) })
    ).rejects.toBeDefined();
  });
});

// ai-chat-v2 T20 (AC-18, AC-30; contracts/server-actions.md §Addresses and start points; openapi ChatRequest): the
// island sends `startedFrom` from the address on the first message only (never on a saved Conversation; AI_SECTION is
// the default and is omitted), and the composer moves to the bottom with a transition reduced motion removes.
describe('first send from a start point', () => {
  function streamingFetch() {
    const enc = new TextEncoder();
    const bodies: unknown[] = [];
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controllers.push(c);
        },
      });
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'x-vercel-ai-ui-message-stream': 'v1',
        },
      });
    });
    const push = (chunk: unknown) =>
      controllers[controllers.length - 1].enqueue(
        enc.encode(`data: ${JSON.stringify(chunk)}\n\n`)
      );
    const finish = () => {
      push({
        type: 'data-conversation',
        data: { conversationId: 'cNew', title: 'Draft' },
      });
      push({
        type: 'data-outcome',
        data: { outcome: 'ANSWERED', counted: true },
      });
      push({ type: 'finish' });
      controllers[controllers.length - 1].close();
    };
    vi.stubGlobal('fetch', fetchMock);
    return { bodies, push, finish };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openAndSend(params: Record<string, string>, text: string) {
    vi.useRealTimers();
    getAllowanceState.mockResolvedValue({ success: true, data: state() });
    listConversationSummaries.mockResolvedValue({
      success: true,
      data: { items: [], timeZone: 'UTC' },
    });
    const user = userEvent.setup();
    render(await AiPage({ searchParams: Promise.resolve(params) }));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), text);
    await user.click(screen.getByRole('button', { name: 'Send' }));
    return user;
  }

  it.each([
    [{ start: 'draft', from: 'invoices' }, 'INVOICE_LIST'],
    [{ start: 'draft', from: 'dashboard' }, 'DASHBOARD_CREATE'],
    [{ start: 'draft' }, 'INVOICE_LIST'],
  ])(
    '%j sends startedFrom %s with the first message',
    async (params, expected) => {
      const net = streamingFetch();
      await openAndSend(params, 'Invoice Acme for 2 hours');
      await waitFor(() => expect(net.bodies).toHaveLength(1));
      expect(net.bodies[0]).toMatchObject({
        conversationId: null,
        startedFrom: expected,
      });
      expect(net.bodies[0]).not.toHaveProperty('origin');
    }
  );

  it.each([[{}], [{ start: 'draft', from: 'bogus' }]])(
    '%j (AI_SECTION) sends no startedFrom',
    async (params) => {
      const net = streamingFetch();
      await openAndSend(params, 'Who owes me money?');
      await waitFor(() => expect(net.bodies).toHaveLength(1));
      expect(net.bodies[0]).not.toHaveProperty('startedFrom');
    }
  );

  it('the second message of the now-saved Conversation carries no startedFrom', async () => {
    const net = streamingFetch();
    const user = await openAndSend(
      { start: 'draft', from: 'dashboard' },
      'Invoice Acme for 2 hours'
    );
    await waitFor(() => expect(net.bodies).toHaveLength(1));
    await act(async () => {
      net.push({ type: 'start', messageId: 'a1' });
      net.push({ type: 'text-start', id: 't1' });
      net.push({ type: 'text-delta', id: 't1', delta: 'Which Acme?' });
      net.push({ type: 'text-end', id: 't1' });
      net.finish();
    });
    await screen.findByText('Which Acme?');
    const box = await screen.findByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(box).not.toBeDisabled());
    await user.type(box, 'Acme Corp');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(net.bodies).toHaveLength(2));
    expect(net.bodies[1]).toMatchObject({ conversationId: 'cNew' });
    expect(net.bodies[1]).not.toHaveProperty('startedFrom');
  });

  it('the composer moves to the bottom with a transition on the first send', async () => {
    streamingFetch();
    await openAndSend({}, 'Who owes me money?');
    const dock = await waitFor(() => {
      const el = document.querySelector(
        '[data-slot="composer-dock"]'
      ) as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(dock.getAttribute('data-composer-move')).toBe('animated');
    expect(dock.className).toMatch(/transition-transform/);
    expect(dock.className).toMatch(/motion-reduce:transition-none/);
  });

  // ai-chat-v2 T21 (screens.md §SCR-02 "used-up on send"): a 429 on the first message puts the composer's place
  // back in the middle without animation, removes the optimistic message and shows the result's error verbatim.
  it('a 429 on the first message returns to the centred layout with the server text', async () => {
    const usedUpText =
      "You've used today's 30 messages. They renew at 00:00 your time. An AI client connected with a Personal key isn't affected.";
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              code: 'RATE_LIMITED',
              error: usedUpText,
              details: {
                kind: 'ALLOWANCE_USED_UP',
                limit: 30,
                renewsAt: '2026-10-12T21:00:00.000Z',
                timeZone: 'Europe/Kyiv',
              },
            }),
            { status: 429, headers: { 'content-type': 'application/json' } }
          )
      )
    );
    await openAndSend({}, 'Who owes me money?');
    expect(await screen.findByText(usedUpText)).toBeTruthy();
    expect(screen.queryByText('Who owes me money?')).toBeNull();
    expect(document.querySelector('[data-slot="composer-dock"]')).toBeNull();
    expect(document.querySelector('[data-slot="start-panel"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: LINE2 })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });

  it('under reduced motion the composer jumps to the bottom with no transition', async () => {
    reducedMotion(true);
    streamingFetch();
    await openAndSend({}, 'Who owes me money?');
    const dock = await waitFor(() => {
      const el = document.querySelector(
        '[data-slot="composer-dock"]'
      ) as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(dock.getAttribute('data-composer-move')).toBe('none');
    expect(dock.style.transform).toBe('');
  });
});
