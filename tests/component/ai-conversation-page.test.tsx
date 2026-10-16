// @vitest-environment jsdom
// T23 (ai-assistant; AC-36, AC-41, AC-07) - SCR-02 saved Conversation (default + links), SCR-12 not-found,
// and the loading skeleton. See tasks/t23-conversation-page-and-chat-links.md and screens.md §SCR-02, §SCR-12.
//
// Seams the implementer must provide:
//   components/ai/message-list.tsx        -> export function MessageList(props: {
//     messages: ConversationMessageView[]; invoiceLinks: Record<string, LinkedInvoiceState>;
//     renderCard?: (cardId: string) => React.ReactNode })
//     One element per message, document order = array order, each with data-role="user"|"assistant".
//     text parts -> plain text (whitespace-pre-wrap, never an anchor, never HTML); data-link parts -> ChatLink
//     (state = invoiceLinks[invoiceId]); data-draft-card parts -> renderCard(cardId) in part order.
//     An aria-live="polite" region exists for finished replies.
//   components/ai/conversation-header.tsx -> export function ConversationHeader(props: {
//     title: string; onDelete: () => void })   "New conversation" link -> /ai, "⋯" button aria-label
//     "Conversation actions" whose menu item "Delete conversation" calls onDelete; "← All conversations" link -> /ai.
//   app/(protected)/ai/[conversationId]/page.tsx      -> async RSC `({ params: Promise<{conversationId}> })`,
//     reads getConversation(actor, id) through unwrapPageResult (NOT_FOUND -> notFound()).
//   app/(protected)/ai/[conversationId]/not-found.tsx -> default export, ContentAreaNotFound.
//   app/(protected)/ai/[conversationId]/loading.tsx   -> default export, >= 4 Skeletons (3 messages + composer).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

// The page's card slot renders DraftCard (T28), which imports the Create action.
vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: vi.fn(),
}));

const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  getConversation: (...a: unknown[]) => getConversation(...a),
  // T40 (R-20): the conversation page also reads the list column.
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
      used: 1,
      left: 29,
      renewsAt: '2026-10-13T00:00:00.000Z',
      timeZone: 'UTC',
    },
  }),
}));

import { MessageList } from '@/components/ai/message-list';
import { ConversationHeader } from '@/components/ai/conversation-header';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import ConversationNotFound from '@/app/(protected)/ai/[conversationId]/not-found';
import ConversationLoading from '@/app/(protected)/ai/[conversationId]/loading';
import type {
  ConversationMessageView,
  LinkedInvoiceState,
} from '@/types/assistant/types';

const NOT_FOUND_COPY = "This conversation can't be found.";

const MESSAGES: ConversationMessageView[] = [
  {
    id: 'm1',
    role: 'user',
    origin: 'TYPED',
    parts: [{ type: 'text', text: 'Who owes me money right now?' }],
    createdAt: '2026-10-10T09:00:00.000Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    origin: null,
    parts: [
      {
        type: 'text',
        text: 'Two Customers owe you money.\nSee https://evil.example/pay now.',
      },
      {
        type: 'data-link',
        data: { kind: 'invoice', invoiceId: 'inv42', label: 'INV-0042' },
      },
      {
        type: 'data-link',
        data: { kind: 'invoice', invoiceId: 'inv43', label: 'INV-0043' },
      },
      {
        type: 'data-link',
        data: { kind: 'invoice', invoiceId: 'inv44', label: 'INV-0044' },
      },
      {
        type: 'data-link',
        data: { kind: 'page', page: 'settings-assistants' },
      },
    ],
    createdAt: '2026-10-10T09:00:05.000Z',
  },
  {
    id: 'm3',
    role: 'user',
    origin: 'TYPED',
    parts: [{ type: 'text', text: 'make a draft for Acme GmbH' }],
    createdAt: '2026-10-10T09:01:00.000Z',
  },
  {
    id: 'm4',
    role: 'assistant',
    origin: null,
    parts: [
      { type: 'text', text: 'Here is the draft for Acme GmbH.' },
      { type: 'data-draft-card', id: 'p1', data: { cardId: 'card1' } },
    ],
    createdAt: '2026-10-10T09:01:05.000Z',
  },
];

const LINKS: Record<string, LinkedInvoiceState> = {
  inv42: {
    state: 'ISSUED',
    invoiceId: 'inv42',
    invoiceNumber: 'INV-0042',
    status: 'paid',
  },
  inv43: { state: 'DRAFT', invoiceId: 'inv43', invoiceNumber: 'INV-0043' },
  inv44: { state: 'UNAVAILABLE' },
};

beforeEach(() => {
  getConversation.mockReset();
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe('MessageList - SCR-02 default', () => {
  it('renders every message in order with its role', () => {
    const { container } = render(
      <MessageList messages={MESSAGES} invoiceLinks={LINKS} />
    );
    const rows = Array.from(container.querySelectorAll('[data-role]'));
    expect(rows.map((r) => r.getAttribute('data-role'))).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(rows[0]).toHaveTextContent('Who owes me money right now?');
    expect(rows[2]).toHaveTextContent('make a draft for Acme GmbH');
    expect(rows[3]).toHaveTextContent('Here is the draft for Acme GmbH.');
  });

  it('shows each linked invoice in its current state (AC-36) and page links from the app map', () => {
    render(<MessageList messages={MESSAGES} invoiceLinks={LINKS} />);
    const issued = screen.getByRole('link', { name: /INV-0042/ });
    expect(issued).toHaveAttribute('href', '/invoices/inv42/edit');
    expect(issued).toHaveTextContent('Paid');
    expect(
      screen.getByRole('link', { name: /INV-0043 · Draft/ })
    ).toHaveAttribute('href', '/invoices/inv43/edit');
    expect(
      screen.getByText('INV-0044 · No longer available')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /INV-0044/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Assistants settings →' })
    ).toHaveAttribute('href', '/settings/assistants');
  });

  // ai-chat-v2 T62 (AC-42/43, ADR-0012) supersedes ai-assistant AC-07 "plain text": replies render as safe Markdown.
  // Kept from AC-07: a model-written outside URL is never an anchor, and the line break survives.
  it('renders Assistant text as Markdown: a model-written outside URL is never an anchor, the line break is kept', () => {
    const { container } = render(
      <MessageList messages={MESSAGES} invoiceLinks={LINKS} />
    );
    expect(
      screen.getByText(/https:\/\/evil\.example\/pay/)
    ).toBeInTheDocument();
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs.some((h) => h?.includes('evil.example'))).toBe(false);
    const textEl = screen.getByText(/Two Customers owe you money\./);
    expect(textEl.textContent).toContain('\n');
    // T73: the break is visible, not only present in the text node.
    const p = textEl.closest('p') ?? textEl;
    expect(
      p.classList.contains('whitespace-pre-line') ||
        p.classList.contains('whitespace-pre-wrap') ||
        p.querySelector('br') !== null
    ).toBe(true);
  });

  // T73 (R20-2, F5): a sent form's composed lines stay on separate lines in the Freelancer bubble.
  it('renders a sent form bubble as plain pre-wrapped text with one line per answer (AC-08)', () => {
    const composed = 'Customer: Acme GmbH\nLine 1 · Price: 40';
    const msgs: ConversationMessageView[] = [
      {
        id: 'f1',
        role: 'user',
        origin: 'FORM',
        parts: [{ type: 'text', text: composed }],
        createdAt: '2026-10-10T09:00:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={msgs} invoiceLinks={{}} />
    );
    const row = container.querySelector('[data-role="user"]')!;
    const el = row.querySelector('.whitespace-pre-wrap');
    expect(el, 'an element with whitespace-pre-wrap').not.toBeNull();
    expect(el!.textContent).toBe(composed);
    expect(el!.textContent!.split('\n')).toEqual([
      'Customer: Acme GmbH',
      'Line 1 · Price: 40',
    ]);
  });

  it.each(['# 5 hours', '1. foo', '- item', '**x**'])(
    'shows %j typed by the Freelancer as literal text (no heading, list or mark) (AC-08)',
    (t) => {
      const msgs: ConversationMessageView[] = [
        {
          id: 'u1',
          role: 'user',
          origin: 'TYPED',
          parts: [{ type: 'text', text: t }],
          createdAt: '2026-10-10T09:00:00.000Z',
        },
      ];
      const { container } = render(
        <MessageList messages={msgs} invoiceLinks={{}} />
      );
      expect(
        container.querySelector('h1, h2, h3, h4, h5, h6, ol, ul, li, strong')
      ).toBeNull();
      expect(container.querySelector('[data-role="user"]')!.textContent).toContain(t);
    }
  );

  it('renders Markdown written by the model but never its HTML or an outside link (AC-42, AC-43)', () => {
    const msgs: ConversationMessageView[] = [
      {
        id: 'x',
        role: 'assistant',
        origin: null,
        parts: [
          {
            type: 'text',
            text: '**bold** <b>html</b> [x](https://evil.example)',
          },
        ],
        createdAt: '2026-10-10T09:00:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={msgs} invoiceLinks={{}} />
    );
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('b, a')).toBeNull();
    expect(container).toHaveTextContent('<b>html</b>');
    expect(container).toHaveTextContent('x');
    expect(container).not.toHaveTextContent('**bold**');
  });

  it('puts the card slot at the draft-card part, in part order, with the card id', () => {
    const renderCard = vi.fn((id: string) => (
      <div data-testid="card-slot">card:{id}</div>
    ));
    const { container } = render(
      <MessageList
        messages={MESSAGES}
        invoiceLinks={LINKS}
        renderCard={renderCard}
      />
    );
    expect(renderCard).toHaveBeenCalledWith('card1');
    const last = container.querySelectorAll('[data-role]')[3] as HTMLElement;
    const text = within(last).getByText('Here is the draft for Acme GmbH.');
    const slot = within(last).getByTestId('card-slot');
    expect(slot).toHaveTextContent('card:card1');
    expect(
      text.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  // ai-chat-v2 T36 (ADR-0010, screens.md «Messages»): the Freelancer's message is a right-aligned secondary bubble of
  // at most 80 % of the column (never full width, never bg-primary); a reply is the avatar plus plain text, no bubble.
  it('shows a user message as a right-aligned secondary bubble of at most 80 %, a reply as avatar + unboxed text', () => {
    const { container } = render(
      <MessageList messages={MESSAGES} invoiceLinks={LINKS} />
    );
    const [user, assistant] = Array.from(
      container.querySelectorAll('[data-role]')
    ) as HTMLElement[];
    expect(user).toHaveClass('justify-end');
    const bubble = user.querySelector(
      '[data-slot="message-content"]'
    ) as HTMLElement;
    expect(bubble).toHaveClass('bg-secondary', 'max-w-[80%]', 'rounded-2xl');
    expect(bubble).not.toHaveClass('bg-primary');
    expect(user.querySelector('.bg-primary')).toBeNull();
    expect(user.querySelector('[data-slot="message-avatar"]')).toBeNull();
    expect(
      assistant.querySelector('[data-slot="message-avatar"]')
    ).not.toBeNull();
    const reply = assistant.querySelector(
      '[data-slot="message-content"]'
    ) as HTMLElement;
    expect(reply).not.toHaveClass('bg-secondary');
    expect(reply).not.toHaveClass('bg-muted');
  });

  it('has no live region of its own (R-22: the island announces the finished reply once)', () => {
    const { container } = render(
      <MessageList messages={MESSAGES} invoiceLinks={LINKS} />
    );
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});

describe('ConversationHeader', () => {
  it('shows the title, a New conversation link to /ai and a menu whose Delete conversation calls onDelete', async () => {
    const onDelete = vi.fn();
    render(
      <ConversationHeader title="Who owes me money?" onDelete={onDelete} />
    );
    expect(screen.getByText('Who owes me money?')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /new conversation/i })
    ).toHaveAttribute('href', '/ai');
    // ai-chat-v2 T19: the phone list is a sheet opened from the workspace's list button, not a link back.
    expect(
      screen.queryByRole('link', { name: /all conversations/i })
    ).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Conversation actions' })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete conversation' })
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  // ai-chat-v2 T36 (screens.md «Header», case "saved"): an h-12 row with a bottom border; the title is truncated.
  it('is an h-12 row with a bottom border and a truncated title', () => {
    render(
      <ConversationHeader title="Who owes me money?" onDelete={() => {}} />
    );
    const header = document.querySelector(
      '[data-slot="chat-header"]'
    ) as HTMLElement;
    expect(header).toHaveClass('h-12', 'border-b', 'shrink-0');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Who owes me money?' })
    ).toHaveClass('truncate');
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'Conversation actions' })
    );
  });
});

describe('Conversation page (SCR-02 reads, SCR-12)', () => {
  it('reads the conversation of the signed-in freelancer by id and renders the exchange with current link states', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: {
          id: 'c1',
          title: 'Who owes me money?',
          lastMessageAt: '2026-10-10T09:01:05.000Z',
        },
        messages: MESSAGES,
        cards: {},
        invoiceLinks: LINKS,
      },
    });
    const ui = await ConversationPage({
      params: Promise.resolve({ conversationId: 'c1' }),
    });
    render(ui);
    expect(getConversation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      'c1'
    );
    expect(screen.getByText('Who owes me money?')).toBeInTheDocument();
    expect(
      screen.getByText('INV-0044 · No longer available')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /INV-0043 · Draft/ })
    ).toBeInTheDocument();
  });

  it('calls notFound() for NOT_FOUND, identically for unknown and foreign ids (AC-41)', async () => {
    getConversation.mockResolvedValue({
      success: false,
      code: 'NOT_FOUND',
      error: NOT_FOUND_COPY,
    });
    await expect(
      ConversationPage({
        params: Promise.resolve({ conversationId: 'unknown' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      ConversationPage({
        params: Promise.resolve({ conversationId: 'foreign' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('SCR-12 not-found page', () => {
  it('shows the fixed copy and a Back to AI link, revealing nothing about the record', () => {
    const { container } = render(<ConversationNotFound />);
    expect(screen.getByText(NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to AI →/ })).toHaveAttribute(
      'href',
      '/ai'
    );
    expect(container.textContent).not.toMatch(/c1|foreign|unknown/);
  });
});

describe('Conversation loading (SCR-03 loading)', () => {
  it('renders three message skeletons and a composer skeleton', () => {
    const { container } = render(<ConversationLoading />);
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThanOrEqual(4);
  });

  // ai-chat-v2 T67 (AC-51; supersedes Review R16-1 / T42): T66 keeps the list in the layout, so this boundary draws
  // only the chat pane (no workspace container, no list rows): the h-12 header and the centred column.
  it('draws only the chat pane: the h-12 header, the centred column, no list skeleton', () => {
    const { container } = render(<ConversationLoading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/16rem|grid-cols/);
    const skeletons = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="skeleton"]')
    );
    expect(
      skeletons.filter((s) => /(^|\s)h-9(\s|$)/.test(s.className)).length
    ).toBe(0);
    expect(container.querySelector('.h-12.border-b')).not.toBeNull();
    expect(container.querySelector('.max-w-3xl')).not.toBeNull();
    expect(skeletons.some((s) => /rounded-2xl/.test(s.className))).toBe(true);
  });
});
