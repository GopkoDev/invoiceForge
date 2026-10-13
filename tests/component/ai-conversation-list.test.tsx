// @vitest-environment jsdom
// T18 (ai-assistant; AC-35, AC-38, AC-42), reworked by ai-chat-v2 T19 (AC-15, AC-17, AC-19): SCR-01 list -
// day groups, folded title search, no-match / empty states, a fixed footer with New chat, the open row marked
// current, no pagination; the loading skeleton; the page reads listConversationSummaries; the sidebar entry.
// See docs/features/ai-chat-v2/screens.md §SCR-01.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let pathname = '/ai';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const listConversationSummaries = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  listConversationSummaries: (...a: unknown[]) => listConversationSummaries(...a),
}));
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
vi.mock('@/lib/actions/assistant-actions', () => ({
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));

import { ConversationList } from '@/components/ai/conversation-list';
import AiLoading from '@/app/(protected)/ai/loading';
import AiPage from '@/app/(protected)/ai/page';
import { navigationMenuConfig } from '@/config/navigation-menu.config';
import { DynamicSidebarSection } from '@/components/layout/dynamic-sidebar-section';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { ConversationSummary } from '@/types/assistant/types';

const RETENTION = 'Conversations are kept for 90 days after their last message.';
const NOW = new Date('2026-10-13T12:00:00.000Z');

// Today, yesterday, 7 days ago and 8 days ago (AC-17), newest first as the service returns them.
const FOUR: ConversationSummary[] = [
  { id: 'c1', title: 'Who owes me money?', lastMessageAt: '2026-10-13T09:00:00.000Z' },
  { id: 'c2', title: 'Invoice Acme for 20 hours', lastMessageAt: '2026-10-12T09:00:00.000Z' },
  { id: 'c3', title: 'Where is the logo set', lastMessageAt: '2026-10-06T09:00:00.000Z' },
  { id: 'c4', title: 'Overdue INVOICES in September', lastMessageAt: '2026-10-05T09:00:00.000Z' },
];

function renderList(items: ConversationSummary[] = FOUR, props: Partial<Parameters<typeof ConversationList>[0]> = {}) {
  return render(<ConversationList conversations={items} timeZone="UTC" onDelete={() => {}} {...props} />);
}

beforeEach(() => {
  pathname = '/ai';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
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
  listConversationSummaries.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ConversationList - default (AC-17, SCR-01)', () => {
  it('groups the rows under Today, Yesterday, Previous 7 days and Older, in that order', () => {
    renderList();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older']);
    const older = screen.getByRole('heading', { name: 'Older' }).closest('section')!;
    expect(within(older).getByRole('link', { name: /Overdue INVOICES/ })).toHaveAttribute('href', '/ai/c4');
    const week = screen.getByRole('heading', { name: 'Previous 7 days' }).closest('section')!;
    expect(within(week).getByRole('link', { name: /Where is the logo/ })).toBeInTheDocument();
  });

  it('hides a group with no rows', () => {
    renderList([FOUR[0], FOUR[3]]);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Today', 'Older']);
  });

  it('shows each row with its title, last-message day and a link to it', () => {
    renderList();
    const links = screen.getAllByRole('link', { name: /Who owes|Invoice Acme|Where is the logo|Overdue/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/ai/c1', '/ai/c2', '/ai/c3', '/ai/c4']);
    expect(screen.getByText('13 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('5 Oct 2026')).toBeInTheDocument();
  });

  it('marks the open Conversation current (aria-current="page")', () => {
    pathname = '/ai/c2';
    renderList();
    expect(screen.getByRole('link', { name: /Invoice Acme/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Who owes/ })).not.toHaveAttribute('aria-current');
  });

  it('has a "Conversations" header, a search box, and a footer with New chat last, above the retention notice', () => {
    renderList();
    expect(screen.getByRole('heading', { level: 2, name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toHaveAttribute('placeholder', 'Search conversations');
    const newChat = screen.getByRole('link', { name: 'New chat' });
    expect(newChat).toHaveAttribute('href', '/ai');
    const links = screen.getAllByRole('link');
    expect(links[links.length - 1]).toBe(newChat);
    expect(newChat.compareDocumentPosition(screen.getByText(RETENTION)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('every row of a group list is a listitem (axe aria-required-children, T31)', () => {
    renderList();
    const lists = screen.getAllByRole('list');
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) {
      expect(Array.from(list.children).every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
      expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
    }
  });

  it('has no pagination and no ?page links', () => {
    renderList();
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull();
    expect(document.querySelector('a[href*="page="]')).toBeNull();
  });

  it('gives each row a delete icon button that reports that conversation', async () => {
    const onDelete = vi.fn();
    renderList(FOUR, { onDelete });
    await userEvent.click(screen.getByRole('button', { name: /delete.*Invoice Acme for 20 hours/i }));
    expect(onDelete).toHaveBeenCalledWith({ kind: 'one', id: 'c2', title: 'Invoice Acme for 20 hours' });
  });

  it('offers "Delete all" in the menu and reports it', async () => {
    const onDelete = vi.fn();
    renderList(FOUR, { onDelete });
    await userEvent.click(screen.getByRole('button', { name: /conversation actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete all' }));
    expect(onDelete).toHaveBeenCalledWith({ kind: 'all' });
  });

  it('truncates an 80-character title visually but keeps the full title as the title attribute', () => {
    const long = 'x'.repeat(80);
    renderList([{ id: 'c9', title: long, lastMessageAt: '2026-10-10T09:00:00.000Z' }]);
    expect(screen.getByTitle(long)).toBeInTheDocument();
  });

  it('calls onPick when a row or New chat is picked (the phone sheet closes on it)', async () => {
    const onPick = vi.fn();
    renderList(FOUR, { onPick });
    await userEvent.click(screen.getByRole('link', { name: /Invoice Acme/ }));
    await userEvent.click(screen.getByRole('link', { name: 'New chat' }));
    expect(onPick).toHaveBeenCalledTimes(2);
  });
});

describe('ConversationList - searching (AC-17)', () => {
  it('"inv" keeps only titles containing it, ignoring case, in their groups', async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByRole('textbox', { name: 'Search conversations' }), 'inv');
    const links = screen.getAllByRole('link', { name: /Who owes|Invoice Acme|Where is the logo|Overdue/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/ai/c2', '/ai/c4']);
  });

  it('ignores extra spaces and look-alike letters', async () => {
    const user = userEvent.setup();
    // "Invoice" spelled with a Cyrillic "о" in the title.
    renderList([{ id: 'c7', title: 'Invоice  Acme', lastMessageAt: '2026-10-13T09:00:00.000Z' }]);
    await user.type(screen.getByRole('textbox', { name: 'Search conversations' }), '  invoice acme ');
    expect(screen.getByRole('link', { name: /Acme/ })).toHaveAttribute('href', '/ai/c7');
  });

  it('says so when none match, with Clear search that restores every row; the footer stays', async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByRole('textbox', { name: 'Search conversations' }), 'zzz');
    expect(screen.getByText('No conversation matches "zzz".')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New chat' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toHaveValue('');
    expect(screen.getAllByRole('link', { name: /Who owes|Invoice Acme|Where is the logo|Overdue/ })).toHaveLength(4);
  });
});

describe('ConversationList - empty', () => {
  it('shows the Empty copy, keeps the retention notice and New chat, disables search and hides Delete all', async () => {
    renderList([]);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText('Ask a question to start one.')).toBeInTheDocument();
    expect(screen.getByText(RETENTION)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New chat' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /conversation actions/i })).toBeNull();
  });
});

describe('AI loading (SCR-01 loading)', () => {
  it('renders the full-height grid with a search skeleton, two group headings and six row skeletons', () => {
    const { container } = render(<AiLoading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(9);
    expect(container.firstElementChild?.className).toMatch(/h-full/);
  });
});

describe('AI page (SCR-01 reads)', () => {
  it('reads every summary of the signed-in Freelancer and renders the list once (desktop pane)', async () => {
    listConversationSummaries.mockResolvedValue({ success: true, data: { items: FOUR, timeZone: 'UTC' } });
    const ui = await AiPage({ searchParams: Promise.resolve({}) });
    expect(listConversationSummaries).toHaveBeenCalledWith({ userId: 'u1', timeZone: 'UTC' });
    render(ui);
    // The phone list lives in a Sheet that is not rendered until opened.
    expect(screen.getAllByText('Who owes me money?')).toHaveLength(1);
    expect(screen.getAllByText(RETENTION)).toHaveLength(1);
  });

  it('routes a FAILED read to the segment error boundary by throwing (not an empty list)', async () => {
    listConversationSummaries.mockResolvedValue({ success: false, code: 'FAILED', error: 'boom' });
    await expect(AiPage({ searchParams: Promise.resolve({}) })).rejects.toBeDefined();
  });
});

describe('Sidebar entry (AC-35 navigation; ai-chat-v2 T25 "AI" group)', () => {
  const group = navigationMenuConfig.sections!.find((s) => s.label === 'AI')!;

  it('has "AI chat" in the "AI" group, pointing at /ai', () => {
    expect(group.type).toBe('group');
    expect(group.items!.find((i) => i.title === 'AI chat')!.url).toBe('/ai');
  });

  it.each(['/ai', '/ai/abc123'])('marks AI chat active on %s', (p) => {
    pathname = p;
    render(
      <SidebarProvider>
        <DynamicSidebarSection section={group} />
      </SidebarProvider>
    );
    const ai = screen.getByRole('link', { name: /^AI chat$/ });
    expect(ai).toHaveAttribute('href', '/ai');
    expect(ai.querySelector('[data-active="true"]') ?? ai.closest('[data-active="true"]')).not.toBeNull();
  });
});
