// @vitest-environment jsdom
// T40 (ai-assistant; AC-01, AC-33, AC-35, AC-37) - review follow-up R-20, R-21, R-24, R-26, R-27, R-28.
// See tasks/t40-ai-layout-and-reuse-fixes.md and screens.md §SCR-01, §SCR-02, §SCR-04.
//
// Seam the implementer must provide (R-28): config/routes.config.ts `protectedRoutes.aiStartDraft`
// = '/ai?start=draft', used by app/(protected)/invoices/layout.tsx "Create with AI".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const deleteConversationMock = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: vi.fn(),
  deleteConversation: (...a: unknown[]) => deleteConversationMock(...a),
  deleteAllConversations: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

const listConversations = vi.fn();
const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  listConversations: (...a: unknown[]) => listConversations(...a),
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
import type { ConversationPage as ListPage } from '@/components/ai/conversation-list';

const page = (titles: string[]): ListPage =>
  ({
    items: titles.map((title, i) => ({ id: `c${i + 1}`, title, lastMessageAt: '2026-10-10T09:00:00.000Z' })),
    total: titles.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasMore: false,
  }) as ListPage;

const allowance = {
  limit: 30,
  used: 1,
  left: 29,
  renewsAt: '2026-10-13T00:00:00.000Z',
  timeZone: 'UTC',
} as AllowanceState;

beforeEach(() => {
  listConversations.mockReset();
  getConversation.mockReset();
  deleteConversationMock.mockReset();
  toastError.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('R-20: /ai/{id} keeps the Conversation list column (AC-35)', () => {
  it('renders the list of Conversations next to the open one', async () => {
    listConversations.mockResolvedValue({ success: true, data: page(['Who owes me money?', 'Draft for Acme']) });
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Who owes me money?', lastMessageAt: '2026-10-10T09:01:05.000Z' },
        messages: [],
        cards: {},
        invoiceLinks: {},
      },
    });
    render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
    expect(screen.getByRole('link', { name: /Draft for Acme/ })).toBeInTheDocument();
  });
});

describe('R-21: below lg the start panel comes first, then "Recent conversations" (AC-01)', () => {
  it('orders the panel before the list in the DOM and gives the list lg ordering', async () => {
    listConversations.mockResolvedValue({ success: true, data: page(['Draft for Acme']) });
    render(await AiPage({ searchParams: Promise.resolve({}) }));
    // T44 N-7: the list is rendered in two slots (lg before the chat, phones after it), so DOM order
    // matches visual order; lg:order-first reordering is gone.
    const panel = screen.getByRole('heading', { name: 'Ask about your invoices' });
    const headings = screen.getAllByRole('heading', { name: 'Recent conversations' });
    const phoneHeading = headings[headings.length - 1];
    expect(panel.compareDocumentPosition(phoneHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('[class*="lg:order-first"]')).toBeNull();
  });
});

describe('R-24: start panel subtitles (AC-01, AC-33)', () => {
  it('default shows the answers subtitle', () => {
    render(<StartPanel state={allowance} onSend={() => {}} />);
    expect(screen.getByText('Answers come from your own invoices, Customers and figures.')).toBeInTheDocument();
  });

  it('start=draft shows the one-sentence subtitle', () => {
    render(<StartPanel state={allowance} start="draft" onSend={() => {}} />);
    expect(
      screen.getByText("Describe it in one sentence. You'll see a card to check before anything is created.")
    ).toBeInTheDocument();
  });
});

describe('R-26: the AI section sits in ContentArea', () => {
  it('wraps children in the shared content container', () => {
    const { container } = render(
      <AiLayout>
        <p>child</p>
      </AiLayout>
    );
    const wrapper = container.querySelector('div.container.mx-auto');
    expect(wrapper).not.toBeNull();
    expect(within(wrapper as HTMLElement).getByText('child')).toBeInTheDocument();
  });
});

describe('R-27: the delete dialog closes on FAILED (AC-37)', () => {
  it('closes the dialog and shows the error', async () => {
    const user = userEvent.setup();
    deleteConversationMock.mockResolvedValue(fail('FAILED', 'The conversation was not deleted. Try again.'));
    render(
      <>
        <ConversationListClient conversations={page(['Who owes me money?'])} timeZone="UTC" />
        <AiModalContainer />
      </>
    );
    await user.click(screen.getByRole('button', { name: 'Delete conversation Who owes me money?' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('The conversation was not deleted. Try again.'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('R-28: shared link style and route', () => {
  const linkTokens = buttonVariants({ variant: 'link' }).split(/\s+/).filter(Boolean);

  it('ChatLink uses the buttonVariants link classes', () => {
    render(
      <ChatLink
        link={{ kind: 'invoice', invoiceId: 'inv43', label: 'INV-0043' }}
        state={{ state: 'DRAFT', invoiceId: 'inv43', invoiceNumber: 'INV-0043' }}
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
        customer: { customerId: 'cust1', name: { freelancerText: 'Acme Corp' }, source: 'REQUEST' },
        senderProfile: { senderProfileId: 'sp1', name: { freelancerText: 'Main' }, source: 'DEFAULT' },
        bankAccount: { bankAccountId: 'ba1', label: 'Mono', currency: 'USD', source: 'DEFAULT' },
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
      invoice: { state: 'DRAFT', invoiceId: 'inv43', invoiceNumber: 'INV-0043' },
    } as unknown as DraftCardView;
    render(<DraftCard card={card} />);
    const cls = screen.getByRole('link', { name: /Open draft/ }).className.split(/\s+/);
    for (const t of linkTokens) expect(cls).toContain(t);
  });

  it('"Create with AI" href comes from protectedRoutes', () => {
    const aiStartDraft = (protectedRoutes as Record<string, unknown>)['aiStartDraft'];
    expect(aiStartDraft).toBe('/ai?start=draft');
    render(
      <InvoicesLayout>
        <p>x</p>
      </InvoicesLayout>
    );
    expect(screen.getByRole('link', { name: /Create with AI/ })).toHaveAttribute('href', aiStartDraft as string);
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
    const push = (c: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
        })
      )
    );
    try {
      listConversations.mockResolvedValue({ success: true, data: page(['Older chat']) });
      const user = userEvent.setup();
      render(await AiPage({ searchParams: Promise.resolve({}) }));
      await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Who owes me money right now?');
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await act(async () => {
        push({ type: 'start', messageId: 'msg1' });
        push({ type: 'text-start', id: 't1' });
        push({ type: 'text-delta', id: 't1', delta: 'Nobody yet.' });
      });
      await screen.findByText('Nobody yet.');
      // Streaming, turn not saved yet: no row for the new Conversation.
      expect(screen.queryByRole('link', { name: /Who owes me money right now\?/ })).toBeNull();

      await act(async () => {
        push({
          type: 'data-conversation',
          data: { conversationId: 'cNew', title: 'Who owes me money right now?' },
        });
        push({ type: 'data-outcome', data: { outcome: 'ANSWERED', counted: true } });
      });

      const fresh = await screen.findAllByRole('link', { name: /Who owes me money right now\?/ });
      const older = screen.getAllByRole('link', { name: /Older chat/ });
      expect(fresh.length).toBe(older.length);
      fresh.forEach((row, i) => {
        expect(row).toHaveAttribute('href', '/ai/cNew');
        expect(row.compareDocumentPosition(older[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
