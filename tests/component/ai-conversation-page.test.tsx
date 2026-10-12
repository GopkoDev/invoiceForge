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

const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  getConversation: (...a: unknown[]) => getConversation(...a),
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({ success: true, data: { userId: 'u1', timeZone: 'UTC' } }),
}));
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: async () => ({
    success: true,
    data: { limit: 30, used: 1, left: 29, renewsAt: '2026-10-13T00:00:00.000Z', timeZone: 'UTC' },
  }),
}));

import { MessageList } from '@/components/ai/message-list';
import { ConversationHeader } from '@/components/ai/conversation-header';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import ConversationNotFound from '@/app/(protected)/ai/[conversationId]/not-found';
import ConversationLoading from '@/app/(protected)/ai/[conversationId]/loading';
import type { ConversationMessageView, LinkedInvoiceState } from '@/types/assistant/types';

const NOT_FOUND_COPY = "This conversation can't be found.";

const MESSAGES: ConversationMessageView[] = [
  {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'Who owes me money right now?' }],
    createdAt: '2026-10-10T09:00:00.000Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Two Customers owe you money.\nSee https://evil.example/pay now.' },
      { type: 'data-link', data: { kind: 'invoice', invoiceId: 'inv42', label: 'INV-0042' } },
      { type: 'data-link', data: { kind: 'invoice', invoiceId: 'inv43', label: 'INV-0043' } },
      { type: 'data-link', data: { kind: 'invoice', invoiceId: 'inv44', label: 'INV-0044' } },
      { type: 'data-link', data: { kind: 'page', page: 'settings-assistants' } },
    ],
    createdAt: '2026-10-10T09:00:05.000Z',
  },
  {
    id: 'm3',
    role: 'user',
    parts: [{ type: 'text', text: 'make a draft for Acme GmbH' }],
    createdAt: '2026-10-10T09:01:00.000Z',
  },
  {
    id: 'm4',
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Here is the draft for Acme GmbH.' },
      { type: 'data-draft-card', id: 'p1', data: { cardId: 'card1' } },
    ],
    createdAt: '2026-10-10T09:01:05.000Z',
  },
];

const LINKS: Record<string, LinkedInvoiceState> = {
  inv42: { state: 'ISSUED', invoiceId: 'inv42', invoiceNumber: 'INV-0042', status: 'paid' },
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
    const { container } = render(<MessageList messages={MESSAGES} invoiceLinks={LINKS} />);
    const rows = Array.from(container.querySelectorAll('[data-role]'));
    expect(rows.map((r) => r.getAttribute('data-role'))).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(rows[0]).toHaveTextContent('Who owes me money right now?');
    expect(rows[2]).toHaveTextContent('make a draft for Acme GmbH');
    expect(rows[3]).toHaveTextContent('Here is the draft for Acme GmbH.');
  });

  it('shows each linked invoice in its current state (AC-36) and page links from the app map', () => {
    render(<MessageList messages={MESSAGES} invoiceLinks={LINKS} />);
    const issued = screen.getByRole('link', { name: /INV-0042/ });
    expect(issued).toHaveAttribute('href', '/invoices/inv42/edit');
    expect(issued).toHaveTextContent('Paid');
    expect(screen.getByRole('link', { name: /INV-0043 · Draft/ })).toHaveAttribute('href', '/invoices/inv43/edit');
    expect(screen.getByText('INV-0044 · No longer available')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /INV-0044/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Assistants settings →' })).toHaveAttribute('href', '/settings/assistants');
  });

  it('keeps Assistant text as plain text: a model-written URL is never an anchor, line breaks are kept', () => {
    const { container } = render(<MessageList messages={MESSAGES} invoiceLinks={LINKS} />);
    expect(screen.getByText(/https:\/\/evil\.example\/pay/)).toBeInTheDocument();
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.includes('evil.example'))).toBe(false);
    const textEl = screen.getByText(/Two Customers owe you money\./);
    expect(textEl.className).toContain('whitespace-pre-wrap');
    expect(textEl.textContent).toContain('\n');
  });

  it('does not render Markdown or HTML written by the model', () => {
    const msgs: ConversationMessageView[] = [
      {
        id: 'x',
        role: 'assistant',
        parts: [{ type: 'text', text: '**bold** <b>html</b> [x](https://evil.example)' }],
        createdAt: '2026-10-10T09:00:00.000Z',
      },
    ];
    const { container } = render(<MessageList messages={msgs} invoiceLinks={{}} />);
    expect(container.querySelector('strong, b, a')).toBeNull();
    expect(container).toHaveTextContent('**bold** <b>html</b> [x](https://evil.example)');
  });

  it('puts the card slot at the draft-card part, in part order, with the card id', () => {
    const renderCard = vi.fn((id: string) => <div data-testid="card-slot">card:{id}</div>);
    const { container } = render(<MessageList messages={MESSAGES} invoiceLinks={LINKS} renderCard={renderCard} />);
    expect(renderCard).toHaveBeenCalledWith('card1');
    const last = container.querySelectorAll('[data-role]')[3] as HTMLElement;
    const text = within(last).getByText('Here is the draft for Acme GmbH.');
    const slot = within(last).getByTestId('card-slot');
    expect(slot).toHaveTextContent('card:card1');
    expect(text.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has a polite live region for finished replies', () => {
    const { container } = render(<MessageList messages={MESSAGES} invoiceLinks={LINKS} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('ConversationHeader', () => {
  it('shows the title, a New conversation link to /ai and a menu whose Delete conversation calls onDelete', async () => {
    const onDelete = vi.fn();
    render(<ConversationHeader title="Who owes me money?" onDelete={onDelete} />);
    expect(screen.getByText('Who owes me money?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new conversation/i })).toHaveAttribute('href', '/ai');
    expect(screen.getByRole('link', { name: /all conversations/i })).toHaveAttribute('href', '/ai');
    await userEvent.click(screen.getByRole('button', { name: 'Conversation actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete conversation' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('Conversation page (SCR-02 reads, SCR-12)', () => {
  it('reads the conversation of the signed-in freelancer by id and renders the exchange with current link states', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Who owes me money?', lastMessageAt: '2026-10-10T09:01:05.000Z' },
        messages: MESSAGES,
        cards: {},
        invoiceLinks: LINKS,
      },
    });
    const ui = await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) });
    render(ui);
    expect(getConversation).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), 'c1');
    expect(screen.getByText('Who owes me money?')).toBeInTheDocument();
    expect(screen.getByText('INV-0044 · No longer available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /INV-0043 · Draft/ })).toBeInTheDocument();
  });

  it('calls notFound() for NOT_FOUND, identically for unknown and foreign ids (AC-41)', async () => {
    getConversation.mockResolvedValue({ success: false, code: 'NOT_FOUND', error: NOT_FOUND_COPY });
    await expect(ConversationPage({ params: Promise.resolve({ conversationId: 'unknown' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    await expect(ConversationPage({ params: Promise.resolve({ conversationId: 'foreign' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
  });
});

describe('SCR-12 not-found page', () => {
  it('shows the fixed copy and a Back to AI link, revealing nothing about the record', () => {
    const { container } = render(<ConversationNotFound />);
    expect(screen.getByText(NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to AI →/ })).toHaveAttribute('href', '/ai');
    expect(container.textContent).not.toMatch(/c1|foreign|unknown/);
  });
});

describe('Conversation loading (SCR-02 loading)', () => {
  it('renders three message skeletons and a composer skeleton', () => {
    const { container } = render(<ConversationLoading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(4);
  });
});
