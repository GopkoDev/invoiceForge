// @vitest-environment jsdom
// T44 (ai-assistant; AC-01, AC-11, AC-35, AC-37), reworked by ai-chat-v2 T19 (AC-15, AC-19; screens.md §Layout and
// breakpoints, §SCR-01 phone sheet): the AI section is a viewport-height shell; AiWorkspace shows the list pane from
// md (768 px) before the chat, and below md the list opens as a left Sheet from the header's list button and closes
// on a pick. "Delete all" still counts the merged list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

// The address the page is rendered at; the /ai page renders at /ai (ai-chat-v2 T31: /ai's island at /ai/{id} is a stale entry).
let mockPathname = '/ai/c1';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => mockPathname,
  useSelectedLayoutSegment: () => mockPathname.split('/')[2] ?? null,
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

import AiLayout from '@/app/(protected)/ai/layout';
import AiPage from '@/app/(protected)/ai/page';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import { ConversationListClient } from '@/components/ai/conversation-list-client';
import {
  NewConversationProvider,
  useNewConversation,
} from '@/components/ai/new-conversation-context';
import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';
import type { ConversationSummary } from '@/types/assistant/types';

const rows = (titles: string[]): ConversationSummary[] =>
  titles.map((title, i) => ({
    id: `c${i + 1}`,
    title,
    lastMessageAt: '2026-10-10T09:00:00.000Z',
  }));

beforeEach(() => {
  mockPathname = '/ai/c1';
  listConversationSummaries.mockReset();
  getConversation.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

async function renderConversationPage() {
  listConversationSummaries.mockResolvedValue({
    success: true,
    data: {
      items: rows(['Who owes me money?', 'Draft for Acme']),
      timeZone: 'UTC',
    },
  });
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
      forms: {},
    },
  });
  // ai-chat-v2 T66 (ADR-0013): the list belongs to the layout, so the page is rendered inside it.
  return render(
    await AiLayout({
      children: await ConversationPage({
        params: Promise.resolve({ conversationId: 'c1' }),
      }),
    })
  );
}

describe('AC-15: the AI section is a viewport-height shell with panes that scroll on their own', () => {
  it('the layout fills the viewport below the app header and hides overflow (no page scroll, no ContentArea)', async () => {
    listConversationSummaries.mockResolvedValue({
      success: true,
      data: { items: rows(['A']), timeZone: 'UTC' },
    });
    // ai-chat-v2 T66 (ADR-0013): the layout is async; it loads the list once.
    const { container } = render(await AiLayout({ children: 'content' }));
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toMatch(/h-\[calc\(100dvh-var\(--header-height\)/);
    expect(shell.className).toMatch(/overflow-hidden/);
    expect(container.querySelector('.container.mx-auto')).toBeNull();
    // ai-chat-v2 T35 (screens.md «Workspace container»): 16 px around the container from md, none below.
    expect(shell.className).toMatch(/md:p-4/);
    expect(shell.className).not.toMatch(/(^|\s)p-4/);
  });

  it('the workspace grid and its panes are min-h-0, the list pane shows from md before the chat', async () => {
    const { container } = await renderConversationPage();
    const grid = container.querySelector(
      '[data-slot="ai-workspace"]'
    ) as HTMLElement;
    expect(grid.className).toMatch(/h-full/);
    expect(grid.className).toMatch(/min-h-0/);
    // ai-chat-v2 T35: the list pane is 16rem; from md the workspace is one rounded bordered container.
    expect(grid.className).toMatch(/md:grid-cols-\[16rem_/);
    expect(grid.className).toMatch(/md:rounded-xl/);
    expect(grid.className).toMatch(/md:border(\s|$)/);
    expect(grid.className).toMatch(/overflow-hidden/);
    const pane = grid.querySelector('aside') as HTMLElement;
    expect(pane.className).toMatch(/hidden/);
    expect(pane.className).toMatch(/md:flex/);
    expect(pane.className).toMatch(/min-h-0/);
    const chat = grid.querySelector(':scope > section') as HTMLElement;
    expect(chat.className).toMatch(/min-h-0/);
    expect(
      pane.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(container.querySelector('[class*="lg:"]')).toBeNull();
  });

  it('the messages scroll inside the chat pane with the composer outside that scroll area', async () => {
    await renderConversationPage();
    const box = screen.getByRole('textbox', { name: 'Message' });
    const scroller = document.querySelector(
      '[data-slot="chat-scroll"]'
    ) as HTMLElement;
    expect(scroller.className).toMatch(/overflow-y-auto/);
    expect(scroller.className).toMatch(/min-h-0/);
    expect(scroller.contains(box)).toBe(false);
  });
});

describe('AC-19: below md the list opens as a left sheet and closes on a pick', () => {
  it('renders the list once (the pane); the sheet is not rendered until opened', async () => {
    await renderConversationPage();
    expect(
      screen.getAllByRole('heading', { level: 2, name: 'Conversations' })
    ).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the header list button (md:hidden) opens the sheet titled Conversations; picking a row closes it', async () => {
    const user = userEvent.setup();
    await renderConversationPage();
    const open = screen.getByRole('button', { name: 'Open conversations' });
    expect(open.className).toMatch(/md:hidden/);
    await user.click(open);
    const sheet = await screen.findByRole('dialog', { name: 'Conversations' });
    await user.click(
      within(sheet).getByRole('link', { name: /Draft for Acme/ })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('on /ai the start screen has the same list button', async () => {
    mockPathname = '/ai';
    listConversationSummaries.mockResolvedValue({
      success: true,
      data: { items: rows(['Draft for Acme']), timeZone: 'UTC' },
    });
    render(
      await AiLayout({
        children: await AiPage({ searchParams: Promise.resolve({}) }),
      })
    );
    expect(
      screen.getByRole('button', { name: 'Open conversations' })
    ).toBeInTheDocument();
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
        <ConversationListClient
          conversations={rows(['A', 'B', 'C'])}
          timeZone="UTC"
        />
        <AiModalContainer />
      </NewConversationProvider>
    );
    expect(
      await screen.findByRole('link', { name: /Fresh chat/ })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Conversation actions' })
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Delete all' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/All 4 conversations will be deleted/)
    ).toBeInTheDocument();
  });
});
