// @vitest-environment jsdom
// T21 (ai-chat-v2; AC-33, spec §6 "Chat, a reply's text appears progressively"): a reply streamed word by word
// (deltas 20–50 ms apart) shows its words progressively, the first one at once, never only as one block after it is
// complete; a saved reply on reopen is shown whole at once. The server pacing (WORD_DELAY_MS = 20, first word
// unpaced) is pinned in tests/unit/lib/ai/run-turn-paced-text.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
}));
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadConversationCards: vi.fn(async () => ({
    success: true,
    data: { cards: {}, invoiceLinks: {}, offers: {} },
  })),
}));
vi.mock('@/components/ai/draft-card', () => ({ DraftCard: () => <div /> }));

import { ChatIsland } from '@/components/ai/chat-island';

const enc = new TextEncoder();
const sseHeaders = {
  'content-type': 'text/event-stream',
  'x-vercel-ai-ui-message-stream': 'v1',
};
function openStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: sseHeaders }),
    push: (c: unknown) =>
      ctrl.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`)),
    end: () => {
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  };
}
const fetchMock = vi.fn();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const allowance = {
  limit: 30 as const,
  used: 2,
  left: 28,
  renewsAt: '2026-10-14T00:00:00.000Z',
  timeZone: 'UTC',
};
const REPLY =
  'Acme Corp owes you 100.00 USD. Globex owes you 250.00 EUR since last month. Nobody else has an open invoice.';

const assistantText = () =>
  Array.from(document.querySelectorAll('[data-role="assistant"]'))
    .map((n) => n.textContent ?? '')
    .join('');

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Streamed reply (AC-33)', () => {
  it('shows the words progressively, the first word at once', async () => {
    render(
      <ChatIsland
        conversationId="c1"
        initialMessages={[]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
      />
    );
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Message' }),
      'Who owes me money?'
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    stream.push({ type: 'start', messageId: 'srv1' });
    stream.push({ type: 'text-start', id: 't1' });
    const words = REPLY.split(' ');
    const seen: string[] = [];
    for (const [i, word] of words.entries()) {
      stream.push({
        type: 'text-delta',
        id: 't1',
        delta: i === 0 ? word : ` ${word}`,
      });
      if (i === 0) {
        // The first word is never held back: it shows before the second one is sent.
        await waitFor(() => expect(assistantText()).toBe(word), {
          timeout: 100,
        });
      }
      await pause(20 + (i % 4) * 10);
      seen.push(assistantText());
    }
    stream.push({ type: 'text-end', id: 't1' });
    stream.push({
      type: 'data-outcome',
      data: { outcome: 'ANSWERED', counted: true },
    });
    stream.push({ type: 'finish' });
    stream.end();
    await waitFor(() => expect(assistantText()).toBe(REPLY));

    const distinct = [...new Set(seen.filter(Boolean))];
    expect(distinct.length).toBeGreaterThanOrEqual(3);
    // Each step only adds text: the reply grows, it never appears as one block at the end.
    for (let i = 1; i < distinct.length; i += 1) {
      expect(distinct[i].startsWith(distinct[i - 1])).toBe(true);
    }
    expect(distinct[0].length).toBeLessThan(REPLY.length);
  });

  it('a saved reply is shown whole at once on reopen', () => {
    render(
      <ChatIsland
        conversationId="c1"
        initialMessages={[
          {
            id: 'm1',
            role: 'user',
            origin: 'TYPED',
            parts: [{ type: 'text', text: 'Who owes me money?' }],
            createdAt: '',
          },
          {
            id: 'm2',
            role: 'assistant',
            origin: null,
            parts: [{ type: 'text', text: REPLY }],
            createdAt: '',
          },
        ]}
        invoiceLinks={{}}
        cards={{}}
        allowance={allowance}
      />
    );
    expect(assistantText()).toBe(REPLY);
  });
});
