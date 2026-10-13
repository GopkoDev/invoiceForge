// @vitest-environment jsdom
// ai-chat-v2 T66 (AC-17, AC-52; ADR-0013; spec §6 "Switching Conversations"): the Conversation list is owned by the
// AI layout (ConversationListProvider), stays mounted across /ai and /ai/{id}, is loaded once, and changes only on
// the list events raised by chat results: conversationCreated, conversationTouched, conversationRenamed,
// conversationsDeleted.
//
// Seams the implementer must provide:
//   components/ai/conversation-list-context.tsx -> 'use client';
//     ConversationListProvider({ conversations, timeZone, children })   seeds + reconciles by id when props change
//     useConversationList() -> { conversations, timeZone,
//        conversationCreated(summary), conversationTouched(id, lastMessageAt, title?),
//        conversationRenamed(id, title), conversationsDeleted(ids) }
//   app/(protected)/ai/layout.tsx -> async server component: loads listConversationSummaries(actor) once and renders
//     the shell + AiWorkspace (list pane + phone sheet read the provider) around {children}.
//   The pages render the chat pane only (header + island); the active row follows useSelectedLayoutSegment().
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
import { useState } from 'react';

const route = vi.hoisted(() => ({
  pathname: '/ai',
  listeners: new Set<() => void>(),
}));
const refresh = vi.fn();
const push = vi.fn();
const router = { push, refresh, replace: vi.fn() };
function goTo(pathname: string) {
  route.pathname = pathname;
  route.listeners.forEach((l) => l());
}
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const sub = (l: () => void) => {
    route.listeners.add(l);
    return () => route.listeners.delete(l);
  };
  return {
    useRouter: () => router,
    usePathname: () =>
      useSyncExternalStore(
        sub,
        () => route.pathname,
        () => route.pathname
      ),
    useSelectedLayoutSegment: () =>
      useSyncExternalStore(
        sub,
        () => route.pathname.split('/')[2] ?? '',
        () => route.pathname.split('/')[2] ?? ''
      ) || null,
    useSearchParams: () => new URLSearchParams(),
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
  };
});

const deleteConversation = vi.fn();
const deleteAllConversations = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadConversationCards: vi.fn(async () => ({
    success: true,
    data: { cards: {}, invoiceLinks: {}, forms: {} },
  })),
  createDraftFromCard: vi.fn(),
  deleteConversation: (...a: unknown[]) => deleteConversation(...a),
  deleteAllConversations: (...a: unknown[]) => deleteAllConversations(...a),
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
      renewsAt: '2026-10-14T00:00:00.000Z',
      timeZone: 'UTC',
    },
  }),
}));
vi.mock('@/lib/helpers/account-name', () => ({
  sessionAccountName: async () => 'Dana',
}));
vi.mock('@/components/modals/invoice/invoice-modal-container', () => ({
  InvoiceModalContainer: () => null,
}));

import AiLayout from '@/app/(protected)/ai/layout';
import AiPage from '@/app/(protected)/ai/page';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import { ChatIsland } from '@/components/ai/chat-island';
import { ConversationHeaderClient } from '@/components/ai/conversation-header-client';
import {
  ConversationListProvider,
  useConversationList,
} from '@/components/ai/conversation-list-context';
type ListContext = typeof import('@/components/ai/conversation-list-context');
import type { ConversationSummary } from '@/types/assistant/types';

const NOW = new Date('2026-10-13T12:00:00.000Z');
// Today, yesterday, 7 days ago and 8 days ago (AC-17), newest first as the service returns them.
const FOUR: ConversationSummary[] = [
  { id: 'c1', title: 'Who owes me money?', lastMessageAt: '2026-10-13T09:00:00.000Z' },
  { id: 'c2', title: 'Invoice Acme for 20 hours', lastMessageAt: '2026-10-12T09:00:00.000Z' },
  { id: 'c3', title: 'Where is the logo set', lastMessageAt: '2026-10-06T09:00:00.000Z' },
  { id: 'c4', title: 'Overdue INVOICES in September', lastMessageAt: '2026-10-05T09:00:00.000Z' },
];

const titlesInList = () => {
  const pane = screen.getByRole('complementary', { name: 'Conversation list' });
  return within(pane)
    .getAllByRole('listitem')
    .map((row) => row.textContent?.replace(/Actions for.*$/, '').trim());
};
const listPane = () =>
  screen.getByRole('complementary', { name: 'Conversation list' });

let navigate: (to: string | null) => void = () => {};
/** Stands in for the router's current page: swaps the chat pane only, the way a navigation under a layout does. */
function Pages() {
  const [at, setAt] = useState<string | null>('c1');
  // eslint-disable-next-line react-hooks/globals -- test seam: hands the navigator to the test body
  navigate = (to) => {
    goTo(to ? `/ai/${to}` : '/ai');
    setAt(to);
  };
  return at ? (
    <div data-testid="chat-pane" data-conversation={at}>
      chat of {at}
    </div>
  ) : (
    <div data-testid="chat-pane" data-conversation="">
      start screen
    </div>
  );
}

async function renderLayout(
  children: React.ReactNode = <Pages />,
  items: ConversationSummary[] = FOUR
) {
  listConversationSummaries.mockResolvedValue({
    success: true,
    data: { items, timeZone: 'UTC' },
  });
  return render(await AiLayout({ children }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  route.pathname = '/ai/c1';
  listConversationSummaries.mockReset();
  getConversation.mockReset();
  deleteConversation.mockReset();
  deleteAllConversations.mockReset();
  refresh.mockReset();
  push.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AC-17 through the layout: grouping, New chat and search stay as they were', () => {
  it('the layout loads the summaries once for the signed-in Freelancer and groups the rows', async () => {
    await renderLayout();
    expect(listConversationSummaries).toHaveBeenCalledTimes(1);
    expect(listConversationSummaries).toHaveBeenCalledWith({
      userId: 'u1',
      timeZone: 'UTC',
    });
    const pane = listPane();
    expect(
      within(pane)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
    ).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older']);
    expect(within(pane).getByRole('link', { name: 'New chat' })).toHaveAttribute(
      'href',
      '/ai'
    );
  });

  it('searching "inv" with extra spaces and other case keeps matching titles, and says so when none match', async () => {
    const user = userEvent.setup();
    await renderLayout();
    const search = screen.getByRole('textbox', { name: 'Search conversations' });
    await user.type(search, '  INv ');
    expect(titlesInList()).toEqual([
      'Invoice Acme for 20 hours',
      'Overdue INVOICES in September',
    ]);
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No conversation matches "zzz".')).toBeInTheDocument();
  });
});

describe('AC-52: switching conversations changes only the chat pane', () => {
  it('keeps the same list DOM node, search text and rows, and loads no list, when another conversation is picked', async () => {
    const user = userEvent.setup();
    await renderLayout();
    const search = screen.getByRole('textbox', { name: 'Search conversations' });
    await user.type(search, 'inv');
    const pane = listPane();
    const rowsBefore = within(pane).getAllByRole('link', { name: /inv/i });
    listConversationSummaries.mockClear();

    act(() => navigate('c2'));

    expect(screen.getByTestId('chat-pane')).toHaveAttribute('data-conversation', 'c2');
    expect(listPane()).toBe(pane);
    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toBe(search);
    expect(search).toHaveValue('inv');
    expect(
      within(pane).getAllByRole('link', { name: /inv/i })
    ).toEqual(rowsBefore); // same row nodes: no re-mount
    expect(listConversationSummaries).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('marks the picked conversation active from the layout segment, and none on /ai', async () => {
    await renderLayout();
    const link = (name: RegExp) => within(listPane()).getByRole('link', { name });
    expect(link(/Who owes me money/)).toHaveAttribute('aria-current', 'page');
    act(() => navigate('c2'));
    expect(link(/Who owes me money/)).not.toHaveAttribute('aria-current');
    expect(link(/Invoice Acme/)).toHaveAttribute('aria-current', 'page');
    const pane = listPane();
    act(() => navigate(null));
    expect(listPane()).toBe(pane);
    expect(link(/Invoice Acme/)).not.toHaveAttribute('aria-current');
    expect(listConversationSummaries).toHaveBeenCalledTimes(1);
  });

  it('the pages render the chat pane only: no list and no list read of their own', async () => {
    listConversationSummaries.mockResolvedValue({
      success: true,
      data: { items: FOUR, timeZone: 'UTC' },
    });
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Who owes me money?', lastMessageAt: FOUR[0].lastMessageAt },
        messages: [],
        cards: {},
        invoiceLinks: {},
        forms: {},
      },
    });
    const conv = render(
      await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) })
    );
    expect(screen.queryByRole('complementary', { name: 'Conversation list' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'New chat' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    conv.unmount();
    render(await AiPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole('complementary', { name: 'Conversation list' })).toBeNull();
    expect(listConversationSummaries).not.toHaveBeenCalled();
  });

  it('a layout re-render with fresh summaries replaces the list state, reconciling by id', async () => {
    const view = await renderLayout();
    expect(titlesInList()).toHaveLength(4);
    const fresh = [
      { id: 'c9', title: 'Added elsewhere', lastMessageAt: '2026-10-13T11:00:00.000Z' },
      FOUR[0],
    ];
    listConversationSummaries.mockResolvedValue({
      success: true,
      data: { items: fresh, timeZone: 'UTC' },
    });
    view.rerender(await AiLayout({ children: <Pages /> }));
    expect(titlesInList()).toEqual(['Added elsewhere', 'Who owes me money?']);
  });
});

describe('ConversationListProvider events (ADR-0013: the only writers of the list)', () => {
  let api!: ReturnType<ListContext['useConversationList']>;
  function Probe() {
    // eslint-disable-next-line react-hooks/globals -- test seam: hands the context API to the test body
    api = useConversationList();
    return (
      <ul data-testid="ids">
        {api.conversations.map((c) => (
          <li key={c.id}>{`${c.id}|${c.title}|${c.lastMessageAt}`}</li>
        ))}
      </ul>
    );
  }
  const ids = () =>
    within(screen.getByTestId('ids'))
      .queryAllByRole('listitem')
      .map((li) => li.textContent);
  const mount = () =>
    render(
      <ConversationListProvider conversations={FOUR} timeZone="UTC">
        <Probe />
      </ConversationListProvider>
    );

  it('is seeded with the summaries and the time zone', () => {
    mount();
    expect(api.timeZone).toBe('UTC');
    expect(ids()).toHaveLength(4);
  });

  it('conversationCreated puts the new conversation at the top; the same id twice adds one row', () => {
    mount();
    const created = { id: 'cN', title: 'Fresh chat', lastMessageAt: '2026-10-13T11:59:00.000Z' };
    act(() => api.conversationCreated(created));
    act(() => api.conversationCreated(created));
    expect(ids()).toEqual([
      'cN|Fresh chat|2026-10-13T11:59:00.000Z',
      ...FOUR.map((c) => `${c.id}|${c.title}|${c.lastMessageAt}`),
    ]);
  });

  it('conversationTouched moves the conversation to the top with the new last-activity time, and may carry a new title', () => {
    mount();
    act(() => api.conversationTouched('c3', '2026-10-13T11:00:00.000Z'));
    expect(ids()?.[0]).toBe('c3|Where is the logo set|2026-10-13T11:00:00.000Z');
    expect(ids()).toHaveLength(4);
    act(() => api.conversationTouched('c4', '2026-10-13T11:30:00.000Z', 'Renamed by touch'));
    expect(ids()?.slice(0, 2)).toEqual([
      'c4|Renamed by touch|2026-10-13T11:30:00.000Z',
      'c3|Where is the logo set|2026-10-13T11:00:00.000Z',
    ]);
  });

  it('conversationTouched for an id the list does not hold adds nothing', () => {
    mount();
    act(() => api.conversationTouched('nope', '2026-10-13T11:00:00.000Z'));
    expect(ids()).toHaveLength(4);
  });

  it('conversationRenamed changes the title in place without reordering', () => {
    mount();
    act(() => api.conversationRenamed('c2', 'Acme, 20 hours'));
    expect(ids()?.[1]).toBe('c2|Acme, 20 hours|2026-10-12T09:00:00.000Z');
    expect(ids()?.map((s) => s?.split('|')[0])).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('conversationsDeleted removes the given ids, one or many', () => {
    mount();
    act(() => api.conversationsDeleted(['c2']));
    expect(ids()?.map((s) => s?.split('|')[0])).toEqual(['c1', 'c3', 'c4']);
    act(() => api.conversationsDeleted(['c1', 'c3', 'c4']));
    expect(ids()).toEqual([]);
  });

  it('new props from a layout re-render replace the state (reconciliation by id)', () => {
    const view = mount();
    act(() => api.conversationsDeleted(['c1']));
    view.rerender(
      <ConversationListProvider conversations={FOUR.slice(0, 2)} timeZone="UTC">
        <Probe />
      </ConversationListProvider>
    );
    expect(ids()?.map((s) => s?.split('|')[0])).toEqual(['c1', 'c2']);
  });
});

describe('the list shows the events', () => {
  function EventButtons() {
    const list = useConversationList();
    return (
      <>
        <button onClick={() => list.conversationRenamed('c3', 'Logo settings')}>rename c3</button>
        <button onClick={() => list.conversationTouched('c4', '2026-10-13T11:00:00.000Z')}>touch c4</button>
      </>
    );
  }

  it('a rename updates the row and a touch reorders it, with no list request', async () => {
    const user = userEvent.setup();
    await renderLayout(<EventButtons />);
    await user.click(screen.getByRole('button', { name: 'rename c3' }));
    expect(within(listPane()).getByRole('link', { name: /Logo settings/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'touch c4' }));
    expect(titlesInList()?.[0]).toBe('Overdue INVOICES in September');
    expect(listConversationSummaries).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('delete updates the list in place', () => {
  async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Delete/ }));
  }

  it('deleting another conversation from the list removes its row without a refresh', async () => {
    const user = userEvent.setup();
    deleteConversation.mockResolvedValue({ success: true, data: undefined });
    await renderLayout();
    await user.click(screen.getByRole('button', { name: 'Actions for Invoice Acme for 20 hours' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await confirmDelete(user);
    await waitFor(() =>
      expect(within(listPane()).queryByRole('link', { name: /Invoice Acme/ })).toBeNull()
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(listConversationSummaries).toHaveBeenCalledTimes(1);
  });

  it('deleting the open conversation from its header removes the row and leaves for /ai', async () => {
    const user = userEvent.setup();
    deleteConversation.mockResolvedValue({ success: true, data: undefined });
    await renderLayout(
      <ConversationHeaderClient conversationId="c1" title="Who owes me money?" />
    );
    // The list pane has its own "Conversation actions" menu: pick the header's.
    await user.click(
      within(
        document.querySelector('[data-slot="chat-header"]') as HTMLElement
      ).getByRole('button', { name: 'Conversation actions' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete conversation' }));
    await confirmDelete(user);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/ai'));
    expect(within(listPane()).queryByRole('link', { name: /Who owes me money/ })).toBeNull();
    expect(titlesInList()).toHaveLength(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('"Delete all" empties the list in place', async () => {
    const user = userEvent.setup();
    deleteAllConversations.mockResolvedValue({ success: true, data: undefined });
    await renderLayout();
    await user.click(screen.getByRole('button', { name: 'Conversation actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete all' }));
    await confirmDelete(user);
    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('chat results raise the list events', () => {
  const sseHeaders = {
    'content-type': 'text/event-stream',
    'x-vercel-ai-ui-message-stream': 'v1',
  };
  const sse = (chunks: unknown[]) =>
    new Response(
      chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n',
      { status: 200, headers: sseHeaders }
    );
  const reply = (extra: unknown[] = []) =>
    sse([
      { type: 'start', messageId: 'srv1' },
      ...extra,
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Done.' },
      { type: 'text-end', id: 't1' },
      { type: 'data-outcome', data: { outcome: 'ANSWERED', counted: true } },
      { type: 'finish' },
    ]);
  const allowance = {
    limit: 30 as const,
    used: 1,
    left: 29,
    renewsAt: '2026-10-14T00:00:00.000Z',
    timeZone: 'UTC',
  };
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/ai');
    route.pathname = '/ai';
  });
  afterEach(() => vi.unstubAllGlobals());

  async function send(text: string) {
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), text);
    await user.click(
      within(
        (document.querySelector('[data-slot="composer-dock"]') as HTMLElement | null) ?? document.body
      ).getByRole('button', { name: 'Send' })
    );
  }

  it('the first turn of a new conversation adds it at the top of the list under Today, with no list request', async () => {
    fetchMock.mockResolvedValue(
      reply([
        { type: 'data-conversation', data: { conversationId: 'cNew', title: 'Brand new chat' } },
      ])
    );
    await renderLayout(
      <ChatIsland conversationId={null} initialMessages={[]} invoiceLinks={{}} cards={{}} allowance={allowance} />
    );
    await send('Who owes me?');
    await waitFor(() => expect(titlesInList()?.[0]).toBe('Brand new chat'));
    expect(titlesInList()).toHaveLength(5);
    expect(listConversationSummaries).toHaveBeenCalledTimes(1);
  });

  it('a saved turn in an older conversation moves it to the top (last activity)', async () => {
    route.pathname = '/ai/c3';
    fetchMock.mockResolvedValue(reply());
    await renderLayout(
      <ChatIsland
        conversationId="c3"
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
      />
    );
    expect(titlesInList()?.[0]).toBe('Who owes me money?');
    await send('And the logo?');
    await waitFor(() => expect(titlesInList()?.[0]).toBe('Where is the logo set'));
    expect(titlesInList()).toHaveLength(4);
    expect(listConversationSummaries).toHaveBeenCalledTimes(1);
  });
});
