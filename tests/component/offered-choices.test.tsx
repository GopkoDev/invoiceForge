// @vitest-environment jsdom
// T22 (ai-chat-v2; AC-08, AC-10, AC-11, AC-12, AC-12b, AC-13) - SCR-04 Offered choices under a reply, and the
// chat island's press path (SCR-03 "choice unavailable", "used-up", "could-not-complete").
//
// Seams:
//   components/ai/offered-choices.tsx -> OfferedChoices({ offer: OfferView | undefined, isLatest, pendingOptionId,
//     onPress(offerId, optionId, label) }): skeleton when undefined; role="group" with a kind-based aria-label;
//     stored labels verbatim (full text in `title`); pressable only when state OPEN and isLatest; chosen =
//     secondary + check + sr-only "(chosen)"; everything disabled otherwise.
//   components/ai/chat-island.tsx -> `offers` prop (page load) merged with loadConversationCards().offers; a
//     data-offer part renders the group; a press sends { conversationId, message: label, choice } with no origin
//     and no startedFrom; 409 CHOICE_UNAVAILABLE removes the optimistic message and shows the sentence; 429 removes
//     it and shows the used-up notice; COULD_NOT_COMPLETE leaves the buttons pressable and "Try again" re-sends
//     the same choice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
// The address the page is rendered at; the /ai page renders at /ai (ai-chat-v2 T31: /ai's island at /ai/{id} is a stale entry).
let mockPathname = '/ai/c1';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({ goToSignIn: vi.fn() }));
const loadConversationCards = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadConversationCards: (...a: unknown[]) => loadConversationCards(...a),
}));
vi.mock('@/components/ai/draft-card', () => ({ DraftCard: () => <div /> }));
const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  getConversation: (...a: unknown[]) => getConversation(...a),
  listConversationSummaries: async () => ({ success: true, data: { items: [], timeZone: 'UTC' } }),
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({ success: true, data: { userId: 'u1', timeZone: 'UTC' } }),
}));
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: async () => ({
    success: true,
    data: { limit: 30, used: 3, left: 27, renewsAt: '2026-10-14T00:00:00.000Z', timeZone: 'UTC' },
  }),
}));

import { OfferedChoices } from '@/components/ai/offered-choices';
import { ChatIsland } from '@/components/ai/chat-island';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { ConversationMessageView, OfferView } from '@/types/assistant/types';

const UNAVAILABLE = 'This option is no longer available. Choose again or type your request.';
const USED_UP_TEXT =
  "You've used today's 30 messages. They renew at 00:00 your time. An AI client connected with a Personal key isn't affected.";
const COULD_NOT = "The reply couldn't be completed. Try again.";

const offer = (over: Partial<OfferView> = {}): OfferView => ({
  offerId: 'off1',
  kind: 'CUSTOMER',
  state: 'OPEN',
  chosenOptionId: null,
  options: [
    { optionId: 0, label: 'Acme Corp' },
    { optionId: 1, label: 'Acme GmbH' },
  ],
  ...over,
});

describe('OfferedChoices (SCR-04)', () => {
  afterEach(() => cleanup());

  it('labels loading: a skeleton row and no group until the OfferView arrives', () => {
    const { container } = render(
      <OfferedChoices offer={undefined} isLatest pendingOptionId={null} onPress={vi.fn()} />
    );
    expect(screen.queryByRole('group')).toBeNull();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(3);
  });

  it.each([
    ['CUSTOMER', 'Choose a Customer'],
    ['BANK_ACCOUNT', 'Choose a bank account'],
    ['PRODUCT', 'Choose a product'],
    ['SENDER_PROFILE', 'Choose a sender profile'],
    ['CURRENCY', 'Choose a currency'],
  ] as const)('%s: a group labelled "%s"', (kind, name) => {
    render(<OfferedChoices offer={offer({ kind })} isLatest pendingOptionId={null} onPress={vi.fn()} />);
    expect(screen.getByRole('group', { name })).toBeTruthy();
  });

  it('pressable: the stored labels verbatim (AC-10 email part included), each enabled and pressable', async () => {
    const onPress = vi.fn();
    const lookAlike = offer({
      options: [
        { optionId: 0, label: 'Acme Corp · billing@acme.com' },
        { optionId: 1, label: 'Аcme Corp · no email' },
      ],
    });
    render(<OfferedChoices offer={lookAlike} isLatest pendingOptionId={null} onPress={onPress} />);
    const group = screen.getByRole('group', { name: 'Choose a Customer' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Acme Corp · billing@acme.com', 'Аcme Corp · no email']);
    expect(buttons.map((b) => b.getAttribute('title'))).toEqual([
      'Acme Corp · billing@acme.com',
      'Аcme Corp · no email',
    ]);
    buttons.forEach((b) => expect(b).not.toBeDisabled());
    await userEvent.setup().click(buttons[1]);
    expect(onPress).toHaveBeenCalledWith('off1', 1, 'Аcme Corp · no email');
  });

  it('a single-option offer is one pressable button', () => {
    render(
      <OfferedChoices
        offer={offer({ kind: 'CURRENCY', options: [{ optionId: 0, label: 'USD' }] })}
        isLatest
        pendingOptionId={null}
        onPress={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'USD' })).not.toBeDisabled();
  });

  it('keyboard order follows the buttons', async () => {
    render(<OfferedChoices offer={offer()} isLatest pendingOptionId={null} onPress={vi.fn()} />);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Acme Corp' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Acme GmbH' }));
  });

  it('pressing: the pressed button shows a spinner and the whole group is disabled', () => {
    render(<OfferedChoices offer={offer()} isLatest={false} pendingOptionId={1} onPress={vi.fn()} />);
    const pressed = screen.getByRole('button', { name: /Acme GmbH/ });
    expect(pressed.querySelector('[data-slot="spinner"], [role="status"], svg.animate-spin')).not.toBeNull();
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    expect(screen.queryByText('(chosen)')).toBeNull();
  });

  it('chosen (AC-12, AC-13): the chosen button is secondary with a check and "(chosen)"; all are disabled', () => {
    const onPress = vi.fn();
    render(
      <OfferedChoices offer={offer({ state: 'CHOSEN', chosenOptionId: 1 })} isLatest pendingOptionId={null} onPress={onPress} />
    );
    const chosen = screen.getByRole('button', { name: 'Acme GmbH (chosen)' });
    expect(chosen.getAttribute('data-variant')).toBe('secondary');
    expect(chosen.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Acme Corp' }).getAttribute('data-variant')).toBe('outline');
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });

  it.each([
    ['CLOSED and latest', offer({ state: 'CLOSED' }), true],
    ['OPEN but not the latest reply', offer(), false],
  ])('inactive (%s): visible, disabled, none marked', (_label, o, isLatest) => {
    render(<OfferedChoices offer={o} isLatest={isLatest} pendingOptionId={null} onPress={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b).toBeDisabled());
    expect(screen.queryByText('(chosen)')).toBeNull();
  });
});

// ---------- the island's press path ----------

const enc = new TextEncoder();
const sseHeaders = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' };
function openStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: sseHeaders }),
    push: (c: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`)),
    end: () => {
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  };
}
function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: sseHeaders });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const fetchMock = vi.fn();
function bodyOf(call: number) {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown> & {
    message: { parts: Array<{ text: string }> };
  };
}
const allowance = (left: number): AllowanceState => ({
  limit: 30,
  used: 30 - left,
  left,
  renewsAt: '2026-10-14T00:00:00.000Z',
  timeZone: 'UTC',
});

const asked: ConversationMessageView[] = [
  { id: 'm1', role: 'user', origin: 'TYPED', parts: [{ type: 'text', text: 'invoice Acme for 20 hours at $50' }], createdAt: '' },
  {
    id: 'm2',
    role: 'assistant',
    origin: null,
    parts: [
      { type: 'text', text: 'Two Customers match "Acme". Which one do you mean?' },
      { type: 'data-offer', id: 'off1', data: { offerId: 'off1' } },
    ],
    createdAt: '',
  },
];

function island(over: Partial<Parameters<typeof ChatIsland>[0]> = {}) {
  return render(
    <ChatIsland
      conversationId="c1"
      initialMessages={asked}
      invoiceLinks={{}}
      cards={{}}
      offers={{ off1: offer() }}
      allowance={allowance(27)}
      {...over}
    />
  );
}
const group = () => screen.getByRole('group', { name: 'Choose a Customer' });

beforeEach(() => {
  mockPathname = '/ai/c1';
  fetchMock.mockReset();
  refresh.mockReset();
  loadConversationCards.mockReset();
  loadConversationCards.mockResolvedValue({ success: true, data: { cards: {}, invoiceLinks: {}, offers: {} } });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ChatIsland - Offered choices under a reply (AC-08)', () => {
  it('renders the reply text, then its group with the stored labels; pressable as the latest reply', () => {
    island();
    expect(screen.getByText('Two Customers match "Acme". Which one do you mean?')).toBeTruthy();
    const buttons = within(group()).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Acme Corp', 'Acme GmbH']);
    buttons.forEach((b) => expect(b).not.toBeDisabled());
  });

  it('a press sends { conversationId, message: label, choice } with no origin and no startedFrom', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island({ startedFrom: 'DASHBOARD_CREATE' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Acme GmbH' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = bodyOf(0);
    expect(body.conversationId).toBe('c1');
    expect(body.choice).toEqual({ offerId: 'off1', optionId: 1 });
    expect(body.message.parts[0].text).toBe('Acme GmbH');
    expect(body).not.toHaveProperty('origin');
    expect(body).not.toHaveProperty('startedFrom');
    // pressing: the label appears at once as the Freelancer's message; the group and the composer are locked.
    expect(document.querySelector('[data-role="user"]:last-of-type')?.textContent).toBe('Acme GmbH');
    within(group()).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.queryByText('(chosen)')).toBeNull();
    stream.end();
  });

  it('after the reply, the refreshed page marks the chosen option; the older group stays visible and disabled', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        { type: 'start', messageId: 'srv1' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Here is the draft for Acme GmbH.' },
        { type: 'text-end', id: 't1' },
        { type: 'data-outcome', data: { outcome: 'ANSWERED', counted: true } },
        { type: 'finish' },
      ])
    );
    const view = island();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Acme GmbH' }));
    await screen.findByText('Here is the draft for Acme GmbH.');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // router.refresh() brings the stored state back through the page's props.
    view.rerender(
      <ChatIsland
        conversationId="c1"
        initialMessages={asked}
        invoiceLinks={{}}
        cards={{}}
        offers={{ off1: offer({ state: 'CHOSEN', chosenOptionId: 1 }) }}
        allowance={allowance(26)}
      />
    );
    expect(screen.getByRole('button', { name: 'Acme GmbH (chosen)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Acme Corp' })).toBeDisabled();
  });

  it('AC-12: after a newer typed message, the earlier group is visible but cannot be pressed', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'never mind, who owes me money?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).not.toHaveProperty('choice');
    within(group()).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    stream.end();
  });

  it('a data-offer part streamed with only its id shows a skeleton until loadConversationCards brings the labels (/ai)', async () => {
    mockPathname = '/ai';
    let resolveCards!: (v: unknown) => void;
    loadConversationCards.mockReturnValueOnce(new Promise((r) => (resolveCards = r)));
    fetchMock.mockResolvedValueOnce(
      sse([
        { type: 'start', messageId: 'srv1' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Which account?' },
        { type: 'text-end', id: 't1' },
        { type: 'data-offer', id: 'off9', data: { offerId: 'off9' } },
        { type: 'data-conversation', data: { conversationId: 'cNew', title: 'Draft' } },
        { type: 'data-outcome', data: { outcome: 'ANSWERED', counted: true } },
        { type: 'finish' },
      ])
    );
    render(
      <ChatIsland conversationId={null} initialMessages={[]} invoiceLinks={{}} cards={{}} allowance={allowance(27)} />
    );
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'invoice Acme GmbH');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Which account?');
    await waitFor(() => expect(loadConversationCards).toHaveBeenCalledWith('cNew'));
    expect(screen.queryByRole('group', { name: 'Choose a bank account' })).toBeNull();
    expect(document.querySelectorAll('[data-slot="offered-choices"] [data-slot="skeleton"]').length).toBe(3);
    await act(async () => {
      resolveCards({
        success: true,
        data: {
          cards: {},
          invoiceLinks: {},
          offers: {
            off9: {
              offerId: 'off9',
              kind: 'BANK_ACCOUNT',
              state: 'OPEN',
              chosenOptionId: null,
              options: [
                { optionId: 0, label: 'Monobank ••••4821 · USD' },
                { optionId: 1, label: 'Wise ••••7710 · USD' },
              ],
            },
          },
        },
      });
    });
    const accounts = await screen.findByRole('group', { name: 'Choose a bank account' });
    expect(within(accounts).getByRole('button', { name: 'Wise ••••7710 · USD' })).not.toBeDisabled();
  });
});

describe('ChatIsland - refused presses', () => {
  it('AC-12b/AC-13: 409 CHOICE_UNAVAILABLE removes the pressed message, shows the sentence, counter unchanged, buttons pressable', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { success: false, code: 'CONFLICT', error: UNAVAILABLE, details: { kind: 'CHOICE_UNAVAILABLE' } })
    );
    island();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Acme GmbH' }));
    expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(screen.getByText('27 of 30 messages left today')).toBeTruthy();
    within(group()).getAllByRole('button').forEach((b) => expect(b).not.toBeDisabled());
    expect(screen.queryByText('(chosen)')).toBeNull();
    // The composer keeps its text empty: the label is never put into the box.
    expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('the unavailable sentence clears on the next send', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { success: false, code: 'CONFLICT', error: UNAVAILABLE, details: { kind: 'CHOICE_UNAVAILABLE' } })
    );
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Acme GmbH' }));
    await screen.findByText(UNAVAILABLE);
    await user.click(screen.getByRole('button', { name: 'Acme Corp' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(bodyOf(1).choice).toEqual({ offerId: 'off1', optionId: 0 });
    stream.end();
  });

  it('AC-11: 429 on a press removes the pressed message, shows the used-up notice, nothing marked', async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, {
        success: false,
        code: 'RATE_LIMITED',
        error: USED_UP_TEXT,
        details: { kind: 'ALLOWANCE_USED_UP', limit: 30, renewsAt: '2026-10-14T00:00:00.000Z', timeZone: 'UTC' },
      })
    );
    island({ allowance: allowance(0) });
    // With no allowance left the buttons are still pressable: the server refuses (AC-11).
    expect(screen.getByRole('button', { name: 'Acme GmbH' })).not.toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Acme GmbH' }));
    expect(await screen.findByText(USED_UP_TEXT)).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(screen.queryByText('(chosen)')).toBeNull();
    within(group()).getAllByRole('button').forEach((b) => expect(b).not.toBeDisabled());
  });

  it('could-not-complete after a press: the buttons are pressable again and "Try again" re-sends the same choice', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        { type: 'start', messageId: 'srv1' },
        { type: 'data-outcome', data: { outcome: 'COULD_NOT_COMPLETE', counted: false } },
        { type: 'finish' },
      ])
    );
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Acme GmbH' }));
    expect(await screen.findByText(COULD_NOT)).toBeTruthy();
    within(group()).getAllByRole('button').forEach((b) => expect(b).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).choice).toEqual({ offerId: 'off1', optionId: 1 });
    expect(bodyOf(1).message.parts[0].text).toBe('Acme GmbH');
    stream.end();
  });
});

describe('Reopen (AC-13)', () => {
  it('/ai/[id] passes the stored offers: the pressed option is marked chosen on reopen', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Invoice Acme' },
        messages: [
          ...asked,
          { id: 'm3', role: 'user', origin: 'PRESSED', parts: [{ type: 'text', text: 'Acme GmbH' }], createdAt: '' },
        ],
        invoiceLinks: {},
        cards: {},
        offers: { off1: offer({ state: 'CHOSEN', chosenOptionId: 1 }) },
      },
    });
    render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
    expect(screen.getByRole('button', { name: 'Acme GmbH (chosen)' })).toBeDisabled();
  });

  it('a latest reply with nothing pressed is still pressable on reopen', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Invoice Acme' },
        messages: asked,
        invoiceLinks: {},
        cards: {},
        offers: { off1: offer() },
      },
    });
    render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
    expect(screen.getByRole('button', { name: 'Acme GmbH' })).not.toBeDisabled();
  });
});
