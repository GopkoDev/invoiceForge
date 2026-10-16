// @vitest-environment jsdom
// T40 (ai-assistant; AC-01, AC-33, AC-35, AC-37) - review follow-up R-20, R-21, R-24, R-26, R-27, R-28.
// See tasks/t40-ai-layout-and-reuse-fixes.md and screens.md §SCR-01, §SCR-02, §SCR-04.
//
// Seam the implementer must provide (R-28): config/routes.config.ts `protectedRoutes.aiStartDraft`
// = '/ai?start=draft', used by app/(protected)/invoices/layout.tsx "Create with AI".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai',
  useSelectedLayoutSegment: () => null,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const deleteConversationMock = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: vi.fn(),
  loadConversationCards: async () => ({
    success: true,
    data: { cards: {}, invoiceLinks: {} },
  }),
  deleteConversation: (...a: unknown[]) => deleteConversationMock(...a),
  deleteAllConversations: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

const listConversationSummaries = vi.fn();
const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  listConversationSummaries: (...a: unknown[]) =>
    listConversationSummaries(...a),
  getConversation: (...a: unknown[]) => getConversation(...a),
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
vi.mock('@/components/modals/invoice/invoice-modal-container', () => ({
  InvoiceModalContainer: () => null,
}));

import AiPage from '@/app/(protected)/ai/page';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import AiLayout from '@/app/(protected)/ai/layout';
import InvoicesLayout from '@/app/(protected)/invoices/layout';
import { StartPanel } from '@/components/ai/start-panel';
import { ChatLink } from '@/components/ai/chat-link';
import { DraftCard } from '@/components/ai/draft-card';
import { ConversationListClient } from '@/components/ai/conversation-list-client';
import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';
import { buttonVariants } from '@/components/ui/button';
import { protectedRoutes } from '@/config/routes.config';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { DraftCardView } from '@/types/assistant/types';
import type { ConversationSummary } from '@/types/assistant/types';

const page = (titles: string[]): ConversationSummary[] =>
  titles.map((title, i) => ({
    id: `c${i + 1}`,
    title,
    lastMessageAt: '2026-10-10T09:00:00.000Z',
  }));
const summaries = (titles: string[]) => ({
  success: true,
  data: { items: page(titles), timeZone: 'UTC' },
});

const allowance = {
  limit: 30,
  used: 1,
  left: 29,
  renewsAt: '2026-10-13T00:00:00.000Z',
  timeZone: 'UTC',
} as AllowanceState;

beforeEach(() => {
  listConversationSummaries.mockReset();
  getConversation.mockReset();
  deleteConversationMock.mockReset();
  toastError.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('R-20: /ai/{id} keeps the Conversation list column (AC-35)', () => {
  it('renders the list of Conversations next to the open one', async () => {
    listConversationSummaries.mockResolvedValue(
      summaries(['Who owes me money?', 'Draft for Acme'])
    );
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: {
          id: 'c1',
          title: 'Who owes me money?',
          lastMessageAt: '2026-10-10T09:01:05.000Z',
        },
        messages: [],
        cards: {},
        invoiceLinks: {},
      },
    });
    // ai-chat-v2 T66 (ADR-0013): the list column is the layout's; the page renders inside it.
    render(
      await AiLayout({
        children: await ConversationPage({
          params: Promise.resolve({ conversationId: 'c1' }),
        }),
      })
    );
    expect(
      screen.getByRole('link', { name: /Draft for Acme/ })
    ).toBeInTheDocument();
  });
});

describe('R-21 (reworked by ai-chat-v2 T19): the list pane precedes the chat in DOM and visual order (AC-01)', () => {
  it('puts the md+ list pane before the start panel, with no CSS reordering', async () => {
    listConversationSummaries.mockResolvedValue(summaries(['Draft for Acme']));
    // ai-chat-v2 T66 (ADR-0013): the list pane is the layout's.
    render(
      await AiLayout({
        children: await AiPage({ searchParams: Promise.resolve({}) }),
      })
    );
    const panel = screen.getByRole('heading', {
      level: 1,
      name: /How can I help with your invoices today\?/,
    });
    const list = screen.getByRole('heading', {
      level: 2,
      name: 'Conversations',
    });
    expect(
      list.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      document.querySelector('[class*="md:order-"], [class*="lg:order-"]')
    ).toBeNull();
  });
});

describe('R-24: start panel subtitles (AC-01, AC-33)', () => {
  // ai-chat-v2 T37 (SCR-02 «Greeting»): the first build's sub-line is replaced by the two-line greeting.
  it('default shows the two-line greeting with its accent, and no sub-line', () => {
    render(
      <StartPanel greeting="Good evening" state={allowance} onSend={() => {}} />
    );
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Good evening How can I help with your invoices today?',
    });
    expect(
      heading.querySelector('[data-slot="greeting-accent"]')
    ).toHaveTextContent('your invoices today?');
    expect(
      screen.queryByText(
        'Ask about your invoices, Customers and payments, or describe an invoice to draft.'
      )
    ).not.toBeInTheDocument();
  });

  it('start=draft shows the one-sentence subtitle', () => {
    render(
      <StartPanel
        greeting="Good evening"
        state={allowance}
        start="draft"
        onSend={() => {}}
      />
    );
    expect(
      screen.getByText(
        "Describe it in one sentence. You'll see a card to check before anything is created."
      )
    ).toBeInTheDocument();
  });
});

describe('R-26 (reworked by ai-chat-v2 T19): the AI section sits in a viewport-height shell, not ContentArea', () => {
  it('wraps children in the full-height shell', async () => {
    // ai-chat-v2 T66 (ADR-0013): the layout is async (it loads the list once for its provider).
    listConversationSummaries.mockResolvedValue(summaries([]));
    const { container } = render(await AiLayout({ children: <p>child</p> }));
    expect(container.querySelector('div.container.mx-auto')).toBeNull();
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toMatch(/overflow-hidden/);
    expect(within(shell).getByText('child')).toBeInTheDocument();
  });
});

describe('R-27: the delete dialog closes on FAILED (AC-37)', () => {
  it('closes the dialog and shows the error', async () => {
    const user = userEvent.setup();
    deleteConversationMock.mockResolvedValue(
      fail('FAILED', 'The conversation was not deleted. Try again.')
    );
    render(
      <>
        <ConversationListClient
          conversations={page(['Who owes me money?'])}
          timeZone="UTC"
        />
        <AiModalContainer />
      </>
    );
    // ai-chat-v2 T35: a row's delete is in its ⋯ menu.
    await user.click(
      screen.getByRole('button', { name: 'Actions for Who owes me money?' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'The conversation was not deleted. Try again.'
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });
});

describe('R-28: shared link style and route', () => {
  const linkTokens = buttonVariants({ variant: 'link' })
    .split(/\s+/)
    .filter(Boolean);

  it('ChatLink uses the buttonVariants link classes', () => {
    render(
      <ChatLink
        link={{ kind: 'invoice', invoiceId: 'inv43', label: 'INV-0043' }}
        state={{
          state: 'DRAFT',
          invoiceId: 'inv43',
          invoiceNumber: 'INV-0043',
        }}
      />
    );
    const cls = screen.getByRole('link').className.split(/\s+/);
    for (const t of linkTokens) expect(cls).toContain(t);
  });

  it('DraftCard created line uses the buttonVariants link classes', () => {
    const card = {
      id: 'card1',
      state: 'CREATED',
      proposal: {
        customer: {
          customerId: 'cust1',
          name: { freelancerText: 'Acme Corp' },
          source: 'REQUEST',
        },
        senderProfile: {
          senderProfileId: 'sp1',
          name: { freelancerText: 'Main' },
          source: 'DEFAULT',
        },
        bankAccount: {
          bankAccountId: 'ba1',
          label: 'Mono',
          currency: 'USD',
          source: 'DEFAULT',
        },
        currency: 'USD',
        issueDate: { value: '2026-10-11', source: 'DEFAULT' },
        dueDate: { value: '2026-11-10', source: 'DEFAULT' },
        lines: [],
        subtotal: '0.00',
        total: '0.00',
        invoiceNumber: null,
        defaultsUsed: [],
      },
      replacedById: null,
      invoice: {
        state: 'DRAFT',
        invoiceId: 'inv43',
        invoiceNumber: 'INV-0043',
      },
    } as unknown as DraftCardView;
    render(<DraftCard card={card} />);
    const cls = screen
      .getByRole('link', { name: /Open in editor/ })
      .className.split(/\s+/);
    for (const t of linkTokens) expect(cls).toContain(t);
  });

  it('"Create with AI" href comes from protectedRoutes', () => {
    const aiStartDraft = (protectedRoutes as Record<string, unknown>)[
      'aiStartDraft'
    ];
    // ai-chat-v2 T20: the link carries its start point (contracts/server-actions.md §Addresses and start points).
    expect(aiStartDraft).toBe('/ai?start=draft&from=invoices');
    render(
      <InvoicesLayout>
        <p>x</p>
      </InvoicesLayout>
    );
    expect(
      screen.getByRole('link', { name: /Create with AI/ })
    ).toHaveAttribute('href', aiStartDraft as string);
  });
});

// T44 N-2: aligned to the contract order (ConversationPart: data-conversation arrives after the turn is
// saved, right before data-outcome) - the route never sends it first. This aligns the test to the contract,
// it does not weaken it: the row must be absent until data-conversation, then head the list.
describe('R-20 / N-2: the new row heads the list once the turn is saved (SCR-01 sending first message)', () => {
  it('has no row while the reply streams, and heads the list when data-conversation arrives', async () => {
    const enc = new TextEncoder();
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
      },
    });
    const push = (c: unknown) =>
      ctrl.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'x-vercel-ai-ui-message-stream': 'v1',
          },
        })
      )
    );
    try {
      listConversationSummaries.mockResolvedValue(summaries(['Older chat']));
      const user = userEvent.setup();
      // ai-chat-v2 T66 (ADR-0013): the list is the layout's; the page renders inside it.
      render(
        await AiLayout({
          children: await AiPage({ searchParams: Promise.resolve({}) }),
        })
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Message' }),
        'Who owes me money right now?'
      );
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await act(async () => {
        push({ type: 'start', messageId: 'msg1' });
        push({ type: 'text-start', id: 't1' });
        push({ type: 'text-delta', id: 't1', delta: 'Nobody yet.' });
      });
      await screen.findByText('Nobody yet.');
      // Streaming, turn not saved yet: no row for the new Conversation.
      expect(
        screen.queryByRole('link', { name: /Who owes me money right now\?/ })
      ).toBeNull();

      await act(async () => {
        push({
          type: 'data-conversation',
          data: {
            conversationId: 'cNew',
            title: 'Who owes me money right now?',
          },
        });
        push({
          type: 'data-outcome',
          data: { outcome: 'ANSWERED', counted: true },
        });
      });

      const fresh = await screen.findAllByRole('link', {
        name: /Who owes me money right now\?/,
      });
      const older = screen.getAllByRole('link', { name: /Older chat/ });
      expect(fresh.length).toBe(older.length);
      fresh.forEach((row, i) => {
        expect(row).toHaveAttribute('href', '/ai/cNew');
        expect(
          row.compareDocumentPosition(older[i]) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
