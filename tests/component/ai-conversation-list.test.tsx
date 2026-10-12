// @vitest-environment jsdom
// T18 (ai-assistant; AC-35, AC-38, AC-42) — SCR-01 list column: default, empty, paged, loading, error,
// plus the sidebar entry "AI" after "Invoices" and its active state.
// See docs/features/ai-assistant/tasks/t18-ai-section-route-and-conversation-list.md and screens.md §SCR-01.
//
// Seams the implementer must provide:
//   components/ai/conversation-list.tsx  -> export function ConversationList(props: {
//     conversations: Page<ConversationSummary>; timeZone: string;
//     onDelete: (target: { kind: 'one'; id: string; title: string } | { kind: 'all' }) => void })
//     Row = link to /ai/{id}; per-row delete icon button (aria-label contains "Delete" and the title);
//     "New conversation" link to /ai; a "⋯" menu button (aria-label "Conversation actions") whose menu has
//     "Delete all" (hidden when empty); Pagination links with href `?page=N` (aria-current="page" on the active one).
//   app/(protected)/ai/loading.tsx       -> default export, >= 6 Skeletons (start panel + five rows)
//   app/(protected)/ai/page.tsx          -> async RSC, reads listConversations(actor, page) and unwraps failures.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let pathname = '/ai';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const listConversations = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  listConversations: (...a: unknown[]) => listConversations(...a),
}));
// T22: the page also reads the allowance for the start panel; a fixed state keeps these list tests unchanged.
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: async () => ({
    success: true,
    data: { limit: 30, used: 1, left: 29, renewsAt: '2026-10-13T00:00:00.000Z', timeZone: 'UTC' },
  }),
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({
    success: true,
    data: { userId: 'u1', timeZone: 'UTC' },
  }),
}));

import { ConversationList } from '@/components/ai/conversation-list';
import AiLoading from '@/app/(protected)/ai/loading';
import AiPage from '@/app/(protected)/ai/page';
import { navigationMenuConfig } from '@/config/navigation-menu.config';
import { DynamicSidebarSection } from '@/components/layout/dynamic-sidebar-section';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { ConversationSummary } from '@/types/assistant/types';

const RETENTION = 'Conversations are kept for 90 days after their last message.';

function pageOf(items: ConversationSummary[], over: Record<string, unknown> = {}) {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasMore: false,
    ...over,
  };
}

const THREE: ConversationSummary[] = [
  { id: 'c1', title: 'Who owes me money?', lastMessageAt: '2026-10-10T09:00:00.000Z' },
  { id: 'c2', title: 'Invoice Acme for 20 hours', lastMessageAt: '2026-10-08T09:00:00.000Z' },
  { id: 'c3', title: 'Where is the logo set', lastMessageAt: '2026-10-02T09:00:00.000Z' },
];

beforeEach(() => {
  pathname = '/ai';
  // jsdom has no matchMedia; the sidebar's useIsMobile reads it.
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
  listConversations.mockReset();
});
afterEach(cleanup);

describe('ConversationList - default (AC-35, AC-38)', () => {
  it('lists each conversation, in the given (newest first) order, with title, date and a link to it', () => {
    render(<ConversationList conversations={pageOf(THREE)} timeZone="UTC" onDelete={() => {}} />);
    const links = screen.getAllByRole('link', { name: /Who owes|Invoice Acme|Where is the logo/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/ai/c1', '/ai/c2', '/ai/c3']);
    expect(screen.getByText(/10 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText(/8 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText(/2 Oct 2026/)).toBeInTheDocument();
  });

  it('shows the fixed retention notice, a New conversation link to /ai and no pagination for one page', () => {
    render(<ConversationList conversations={pageOf(THREE)} timeZone="UTC" onDelete={() => {}} />);
    expect(screen.getByText(RETENTION)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new conversation/i })).toHaveAttribute('href', '/ai');
    expect(screen.queryByRole('navigation', { name: /pagination/i })).not.toBeInTheDocument();
  });

  it('gives each row a delete icon button that reports that conversation', async () => {
    const onDelete = vi.fn();
    render(<ConversationList conversations={pageOf(THREE)} timeZone="UTC" onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete.*Invoice Acme for 20 hours/i }));
    expect(onDelete).toHaveBeenCalledWith({ kind: 'one', id: 'c2', title: 'Invoice Acme for 20 hours' });
  });

  it('offers "Delete all" in the menu and reports it', async () => {
    const onDelete = vi.fn();
    render(<ConversationList conversations={pageOf(THREE)} timeZone="UTC" onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /conversation actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete all' }));
    expect(onDelete).toHaveBeenCalledWith({ kind: 'all' });
  });

  it('truncates an 80-character title visually but keeps the full title as the title attribute', () => {
    const long = 'x'.repeat(80);
    render(
      <ConversationList
        conversations={pageOf([{ id: 'c9', title: long, lastMessageAt: '2026-10-10T09:00:00.000Z' }])}
        timeZone="UTC"
        onDelete={() => {}}
      />
    );
    expect(screen.getByTitle(long)).toBeInTheDocument();
  });
});

describe('ConversationList - empty', () => {
  it('shows the Empty copy, keeps the retention notice and New conversation, hides Delete all', async () => {
    render(<ConversationList conversations={pageOf([], { total: 0, totalPages: 0 })} timeZone="UTC" onDelete={() => {}} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText('Ask a question to start one.')).toBeInTheDocument();
    expect(screen.getByText(RETENTION)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new conversation/i })).toBeInTheDocument();
    const menu = screen.queryByRole('button', { name: /conversation actions/i });
    if (menu) {
      await userEvent.click(menu);
      expect(screen.queryByRole('menuitem', { name: 'Delete all' })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Delete all')).not.toBeInTheDocument();
  });
});

describe('ConversationList - paged', () => {
  it('renders page-number pagination links under the list and marks the current page', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      title: `Chat ${i}`,
      lastMessageAt: '2026-10-10T09:00:00.000Z',
    }));
    render(
      <ConversationList
        conversations={pageOf(items, { total: 45, totalPages: 3, hasMore: true, page: 2 })}
        timeZone="UTC"
        onDelete={() => {}}
      />
    );
    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(within(nav).getByRole('link', { name: '1' })).toHaveAttribute('href', expect.stringContaining('page=1'));
    expect(within(nav).getByRole('link', { name: '3' })).toHaveAttribute('href', expect.stringContaining('page=3'));
    expect(within(nav).getByRole('link', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(RETENTION)).toBeInTheDocument();
  });
});

describe('AI loading (SCR-01 loading)', () => {
  it('renders the start-panel skeleton and five list-row skeletons', () => {
    const { container } = render(<AiLoading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(6);
  });
});

describe('AI page (SCR-01 reads)', () => {
  it('reads the requested page of the signed-in freelancer, newest first, and renders the list', async () => {
    listConversations.mockResolvedValue({ success: true, data: pageOf(THREE, { page: 2, totalPages: 2 }) });
    const ui = await AiPage({ searchParams: Promise.resolve({ page: '2' }) });
    expect(listConversations).toHaveBeenCalledWith({ userId: 'u1', timeZone: 'UTC' }, 2);
    render(ui);
    expect(screen.getByText('Who owes me money?')).toBeInTheDocument();
    expect(screen.getByText(RETENTION)).toBeInTheDocument();
  });

  it('routes a FAILED read to the segment error boundary by throwing (not an empty list)', async () => {
    listConversations.mockResolvedValue({ success: false, code: 'FAILED', error: 'boom' });
    await expect(AiPage({ searchParams: Promise.resolve({}) })).rejects.toBeDefined();
  });
});

describe('Sidebar entry (AC-35 navigation)', () => {
  const main = navigationMenuConfig.sections!.find((s) => s.type === 'main')!;

  it('has "AI" right after "Invoices" in the main section, pointing at /ai', () => {
    const titles = main.items!.map((i) => i.title);
    expect(titles.indexOf('AI')).toBe(titles.indexOf('Invoices') + 1);
    expect(main.items!.find((i) => i.title === 'AI')!.url).toBe('/ai');
  });

  it.each(['/ai', '/ai/abc123'])('marks AI active on %s and not Invoices', (p) => {
    pathname = p;
    render(
      <SidebarProvider>
        <DynamicSidebarSection section={main} />
      </SidebarProvider>
    );
    const ai = screen.getByRole('link', { name: /^AI$/ });
    expect(ai).toHaveAttribute('href', '/ai');
    expect(ai.querySelector('[data-active="true"]') ?? ai.closest('[data-active="true"]')).not.toBeNull();
    const inv = screen.getByRole('link', { name: /Invoices/ });
    expect(inv.querySelector('[data-active="true"]')).toBeNull();
  });
});
