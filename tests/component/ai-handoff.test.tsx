// @vitest-environment jsdom
// T26 (ai-chat-v2; AC-29; ADR-0009; sad.md §6 critical flow 3; screens.md §SCR-02 "handoff", "handoff missing"):
// the dashboard prompt reaches the AI section through a one-time sessionStorage entry. The address carries only
// the id; the island takes and deletes the entry once, drops ?handoff= with replaceState and sends the text with
// origin DASHBOARD and startedFrom DASHBOARD_PROMPT. A missing / taken / blocked entry is a plain new Conversation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ai',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadConversationCards: vi.fn(async () => ({
    success: true,
    data: { cards: {}, invoiceLinks: {}, offers: {} },
  })),
}));
vi.mock('@/lib/services/conversations', () => ({
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
      renewsAt: '2026-10-14T00:00:00.000Z',
      timeZone: 'UTC',
    },
  }),
}));

import {
  HANDOFF_PARAM,
  takeHandoff,
  writeHandoff,
} from '@/components/ai/ai-handoff';
import { ChatIsland } from '@/components/ai/chat-island';
import AiPage from '@/app/(protected)/ai/page';

// ai-chat-v2 T37: the start screen's greeting h1 ends with this line whatever the time and name.
const GREETING = /How can I help with your invoices today\?/;
const allowance = {
  limit: 30 as const,
  used: 1,
  left: 29,
  renewsAt: '2026-10-14T00:00:00.000Z',
  timeZone: 'UTC',
};

const enc = new TextEncoder();
function pendingStream(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(
        enc.encode(
          `data: ${JSON.stringify({ type: 'start', messageId: 'srv1' })}\n\n`
        )
      );
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
}
const fetchMock = vi.fn();
const replaceState = vi.spyOn(window.history, 'replaceState');
const bodyOf = (call: number) =>
  JSON.parse(
    String((fetchMock.mock.calls[call][1] as RequestInit).body)
  ) as Record<string, unknown> & {
    message: { parts: Array<{ text: string }> };
  };

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => pendingStream());
  vi.stubGlobal('fetch', fetchMock);
  replaceState.mockClear();
  window.history.pushState({}, '', '/ai?handoff=placeholder');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ai-handoff helper (ADR-0009)', () => {
  it('stores the text under a one-time id; the id never contains the text', () => {
    const id = writeHandoff('who owes me money?')!;
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(id).not.toContain('owes');
    expect(takeHandoff(id)).toBe('who owes me money?');
    expect(takeHandoff(id)).toBeNull();
  });

  it('an unknown id takes nothing', () => {
    expect(takeHandoff('nope')).toBeNull();
  });

  it('blocked storage: write gives no id and take gives nothing, never throwing', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    try {
      expect(writeHandoff('hello')).toBeNull();
      expect(takeHandoff('any')).toBeNull();
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });

  it('the address parameter is "handoff"', () => {
    expect(HANDOFF_PARAM).toBe('handoff');
  });
});

describe('ChatIsland takes the hand-off once (AC-29)', () => {
  it('sends the prompt with origin DASHBOARD and startedFrom DASHBOARD_PROMPT, drops ?handoff=, skips the start screen', async () => {
    const id = writeHandoff('who owes me money?')!;
    window.history.pushState({}, '', `/ai?handoff=${id}`);
    render(
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
        handoffId={id}
      />
    );
    expect(screen.queryByRole('heading', { name: GREETING })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = bodyOf(0);
    expect(body).toMatchObject({
      conversationId: null,
      origin: 'DASHBOARD',
      startedFrom: 'DASHBOARD_PROMPT',
    });
    expect(body.message.parts[0].text).toBe('who owes me money?');
    expect(body).not.toHaveProperty('choice');
    expect(await screen.findByText('who owes me money?')).toBeTruthy();
    expect(window.location.search).not.toContain('handoff');
    expect(replaceState).toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
    // The composer is already docked: no move from the middle.
    expect(
      document
        .querySelector('[data-slot="composer-dock"]')
        ?.getAttribute('data-composer-move')
    ).not.toBe('animated');
  });

  it('a second mount with the same id (reload, Back, double effect) sends nothing and shows the start screen', async () => {
    const id = writeHandoff('who owes me money?')!;
    const first = render(
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
        handoffId={id}
      />
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();
    render(
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
        handoffId={id}
      />
    );
    expect(await screen.findByRole('heading', { name: GREETING })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a missing entry is a plain new Conversation: the default start screen, nothing sent, the parameter dropped', async () => {
    window.history.pushState({}, '', '/ai?handoff=missing');
    render(
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
        handoffId="missing"
      />
    );
    expect(await screen.findByRole('heading', { name: GREETING })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain('handoff');
  });

  it('a typed first message still carries no origin', async () => {
    render(
      <ChatIsland
        conversationId={null}
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
      />
    );
    expect(screen.getByRole('heading', { name: GREETING })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('/ai page wiring', () => {
  it('passes ?handoff= to the island, which sends the stored prompt', async () => {
    const id = writeHandoff('what is overdue?')!;
    render(
      await AiPage({ searchParams: Promise.resolve({ [HANDOFF_PARAM]: id }) })
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      origin: 'DASHBOARD',
      startedFrom: 'DASHBOARD_PROMPT',
    });
  });
});
