// @vitest-environment jsdom
// T44 (ai-assistant; AC-01, AC-11, AC-35, AC-37) - review follow-up N-3, N-7, N-11 (N-2 lives in
// ai-layout-reuse-t40.test.tsx; N-8 is docs). See screens.md §SCR-01, §SCR-02, §SCR-04.
//
// Seam the implementer must provide: AiWorkspace renders the list in two slots - `hidden lg:block`
// before the chat <section> (lg and up) and `lg:hidden` after it (phones, /ai only).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: vi.fn(),
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
import { ConversationListClient } from '@/components/ai/conversation-list-client';
import { NewConversationProvider, useNewConversation } from '@/components/ai/new-conversation-context';
import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';
import type { ConversationPage as ListPage } from '@/components/ai/conversation-list';

const LG_SLOT = '.hidden.lg\\:block';
const PHONE_SLOT = '.lg\\:hidden';

const page = (titles: string[], total = titles.length): ListPage =>
  ({
    items: titles.map((title, i) => ({ id: `c${i + 1}`, title, lastMessageAt: '2026-10-10T09:00:00.000Z' })),
    total,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasMore: false,
  }) as ListPage;

beforeEach(() => {
  listConversations.mockReset();
  getConversation.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

async function renderConversationPage() {
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
  return render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
}

describe('N-3: below lg /ai/{id} shows only the Conversation (AC-35, SCR-02)', () => {
  it('renders the list only in the lg slot and keeps the "All conversations" link', async () => {
    await renderConversationPage();
    expect(screen.getByRole('link', { name: /All conversations/ })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { name: 'Recent conversations' });
    expect(headings).toHaveLength(1);
    for (const h of headings) {
      expect(h.closest(LG_SLOT)).not.toBeNull();
      expect(h.closest(PHONE_SLOT)).toBeNull();
    }
  });

  it('on /ai the list stays below the chat on phones (a lg:hidden slot)', async () => {
    listConversations.mockResolvedValue({ success: true, data: page(['Draft for Acme']) });
    render(await AiPage({ searchParams: Promise.resolve({}) }));
    const phoneHeadings = screen
      .getAllByRole('heading', { name: 'Recent conversations' })
      .filter((h) => h.closest(PHONE_SLOT) !== null);
    expect(phoneHeadings).toHaveLength(1);
  });
});

describe('N-7: DOM order matches visual order at every breakpoint (AC-01 a11y)', () => {
  it('puts the lg list before the chat and the phone list after it, without lg:order-first', async () => {
    listConversations.mockResolvedValue({ success: true, data: page(['Draft for Acme']) });
    const { container } = render(await AiPage({ searchParams: Promise.resolve({}) }));
    const chat = screen.getByRole('textbox', { name: 'Message' });
    const lgSlot = container.querySelector(LG_SLOT);
    const phoneSlot = container.querySelector(PHONE_SLOT);
    expect(lgSlot).not.toBeNull();
    expect(phoneSlot).not.toBeNull();
    expect(chat.compareDocumentPosition(lgSlot as Element) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(chat.compareDocumentPosition(phoneSlot as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[class*="lg:order-first"]')).toBeNull();
  });
});

describe('N-11: "Delete all" counts the merged list (AC-37)', () => {
  function Announce() {
    const ctx = useNewConversation();
    useEffect(() => ctx?.announce({ id: 'cNew', title: 'Fresh chat' }), []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }

  it('names server total + 1 when a just-announced row is merged in', async () => {
    const user = userEvent.setup();
    render(
      <NewConversationProvider>
        <Announce />
        <ConversationListClient conversations={page(['A', 'B', 'C'])} timeZone="UTC" />
        <AiModalContainer />
      </NewConversationProvider>
    );
    expect(await screen.findByRole('link', { name: /Fresh chat/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conversation actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete all' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/All 4 conversations will be deleted/)).toBeInTheDocument();
  });
});
