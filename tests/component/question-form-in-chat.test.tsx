// @vitest-environment jsdom
// T60 (ai-chat-v2; AC-08, AC-08b, AC-12, AC-40, F5, F7, F8) - the Question form (T59 QuestionForm) wired into the chat
// island. Rewrites T22's tests/component/offered-choices.test.tsx (OfferedChoices, the press path) for forms; every
// case there has its form counterpart here (hard rule D-15: rewritten, not deleted).
//
// Seams:
//   components/ai/chat-island.tsx -> `forms: Record<string, FormView>` prop (page load) merged with
//     loadConversationCards().forms; a data-offer part (its offerId is the form id) renders QuestionForm in the
//     reply's content column; picks live in the form's state only; Send posts
//     { conversationId, message: <composed text>, form: { formId, answers } } with no `choice`, no `origin`, no
//     `startedFrom`; the optimistic bubble shows the composed lines. 409 CHOICE_UNAVAILABLE removes the optimistic
//     message and shows the server sentence (picks kept, nothing marked); 400 shows the field errors under the
//     questions (picks kept); 429 shows the used-up notice (picks kept); COULD_NOT_COMPLETE keeps the picks.
//     A typed message while a form is open is sent as a normal typed message (no `form`).
//   components/ai/offered-choices.tsx is gone and nothing imports OfferedChoices.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// SCR-04: a chip that can't be pressed is aria-disabled (still focusable and readable), never natively disabled.
const expectOff = (b: HTMLElement) => {
  expect(b).toHaveAttribute('aria-disabled', 'true');
  expect(b).not.toBeDisabled();
};
const expectOn = (b: HTMLElement) => expect(b).not.toHaveAttribute('aria-disabled', 'true');

const refresh = vi.fn();
let mockPathname = '/ai/c1';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
}));
const loadConversationCards = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadConversationCards: (...a: unknown[]) => loadConversationCards(...a),
}));
vi.mock('@/components/ai/draft-card', () => ({ DraftCard: () => <div /> }));
const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  getConversation: (...a: unknown[]) => getConversation(...a),
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
      used: 3,
      left: 27,
      renewsAt: '2026-10-14T00:00:00.000Z',
      timeZone: 'UTC',
    },
  }),
}));

import { ChatIsland } from '@/components/ai/chat-island';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { ConversationMessageView, FormQuestionView, FormView } from '@/types/assistant/types';

const UNAVAILABLE = 'This form is no longer available. Answer the latest questions or type your request.';
const USED_UP_TEXT =
  "You've used today's 30 messages. They renew at 00:00 your time. An AI client connected with a Personal key isn't affected.";
const COULD_NOT = "The reply couldn't be completed. Try again.";
const COMPOSED = 'Customer: Acme GmbH\nBank account: Wise ••••7710 · USD';

const customerQ = (over: Partial<FormQuestionView> = {}): FormQuestionView => ({
  questionId: 0,
  field: 'CUSTOMER',
  lineIndex: null,
  heading: 'Customer',
  prompt: 'Which Customer is this invoice for?',
  options: [
    { optionId: 0, label: 'Acme Corp · billing@acme.com' },
    { optionId: 1, label: 'Acme GmbH' },
  ],
  input: 'TEXT',
  required: true,
  skippable: false,
  matchCount: null,
  ...over,
});
const bankQ = (over: Partial<FormQuestionView> = {}): FormQuestionView => ({
  questionId: 1,
  field: 'BANK_ACCOUNT',
  lineIndex: null,
  heading: 'Bank account',
  prompt: 'Which bank account should the invoice use?',
  options: [
    { optionId: 0, label: 'Monobank ••••4821 · USD' },
    { optionId: 1, label: 'Wise ••••7710 · USD' },
  ],
  input: 'NONE',
  required: true,
  skippable: false,
  matchCount: null,
  ...over,
});
const form = (over: Partial<FormView> = {}): FormView => ({
  formId: 'f1',
  state: 'OPEN',
  questions: [customerQ(), bankQ()],
  answers: null,
  ...over,
});
const sentForm = (): FormView =>
  form({
    state: 'CHOSEN',
    answers: [
      { questionId: 0, optionId: 1 },
      { questionId: 1, optionId: 1 },
    ],
  });

// ---------- helpers ----------
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
const answeredReply = (text: string) =>
  sse([
    { type: 'start', messageId: 'srv1' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'data-outcome', data: { outcome: 'ANSWERED', counted: true } },
    { type: 'finish' },
  ]);

const asked: ConversationMessageView[] = [
  {
    id: 'm1',
    role: 'user',
    origin: 'TYPED',
    parts: [{ type: 'text', text: 'invoice Acme for 20 hours at $50' }],
    createdAt: '',
  },
  {
    id: 'm2',
    role: 'assistant',
    origin: null,
    parts: [
      { type: 'text', text: 'I need a few details.' },
      { type: 'data-offer', id: 'f1', data: { offerId: 'f1' } },
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
      forms={{ f1: form() }}
      allowance={allowance(27)}
      {...over}
    />
  );
}
const theForm = () => screen.getByRole('group', { name: 'A few details' });
const chipIn = (name: string | RegExp) => within(theForm()).getByRole('radio', { name });
const formSend = () => within(theForm()).getByRole('button', { name: /^send/i });
const composerDock = () => document.querySelector('[data-slot="composer-dock"]') as HTMLElement;
const composerSend = () => within(composerDock()).getByRole('button', { name: 'Send' });
async function answerBoth(user: ReturnType<typeof userEvent.setup>) {
  await user.click(chipIn('Acme GmbH'));
  await user.click(chipIn('Wise ••••7710 · USD'));
}

beforeEach(() => {
  mockPathname = '/ai/c1';
  fetchMock.mockReset();
  refresh.mockReset();
  loadConversationCards.mockReset();
  loadConversationCards.mockResolvedValue({
    success: true,
    data: { cards: {}, invoiceLinks: {}, forms: {} },
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------- OfferedChoices is gone ----------
describe('OfferedChoices is removed (T60)', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === 'node_modules' || name === '.next' || name.startsWith('.')) return [];
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }
  it('components/ai/offered-choices.tsx no longer exists', () => {
    expect(existsSync(join(process.cwd(), 'components/ai/offered-choices.tsx'))).toBe(false);
  });
  it('nothing in components, app or lib imports or names OfferedChoices', () => {
    const hits = ['components', 'app', 'lib']
      .flatMap((d) => sources(join(process.cwd(), d)))
      .filter((f) => /OfferedChoices|offered-choices/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('the island and the page no longer take or pass `offers`', () => {
    const island = readFileSync(join(process.cwd(), 'components/ai/chat-island.tsx'), 'utf8');
    const page = readFileSync(join(process.cwd(), 'app/(protected)/ai/[conversationId]/page.tsx'), 'utf8');
    expect(island).not.toMatch(/\boffers\b/);
    expect(page).not.toMatch(/\boffers\b/);
    expect(page).toMatch(/\bforms\b/);
  });
});

// ---------- the form under a reply (was: OfferedChoices (SCR-04) + AC-08) ----------
describe('ChatIsland - the Question form under a reply (AC-08, AC-08b)', () => {
  it('renders the reply text, then its form with the stored labels verbatim, pressable as the latest reply', () => {
    island();
    expect(screen.getByText('I need a few details.')).toBeTruthy();
    const customers = within(screen.getByRole('radiogroup', { name: 'Customer' })).getAllByRole('radio');
    // AC-10: the email part of a label is shown verbatim; "Other…" follows the stored options.
    expect(customers.map((b) => b.textContent)).toEqual(['Acme Corp · billing@acme.com', 'Acme GmbH', 'Other…']);
    expect(customers.map((b) => b.getAttribute('title'))).toEqual(['Acme Corp · billing@acme.com', 'Acme GmbH', 'Other…']);
    const accounts = within(screen.getByRole('radiogroup', { name: 'Bank account' })).getAllByRole('radio');
    expect(accounts.map((b) => b.textContent)).toEqual(['Monobank ••••4821 · USD', 'Wise ••••7710 · USD']);
    [...customers, ...accounts].forEach((b) => expectOn(b));
    // ai-chat-v2 T38: the form sits inside the reply's content column, after its text, not under the avatar.
    const content = theForm().closest('[data-slot="message-content"]') as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.closest('[data-role="assistant"]')).not.toBeNull();
    const text = content.querySelector('[data-slot="message-response"]') as HTMLElement;
    expect(text.compareDocumentPosition(theForm()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC-08b: Send stays disabled until both questions are answered', async () => {
    island();
    const user = userEvent.setup();
    expectOff(formSend());
    await user.click(chipIn('Acme GmbH'));
    expectOff(formSend());
    await user.click(chipIn('Wise ••••7710 · USD'));
    expectOn(formSend());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('labels loading: a skeleton and no form until the FormView arrives (/ai)', async () => {
    mockPathname = '/ai';
    let resolveCards!: (v: unknown) => void;
    loadConversationCards.mockReturnValueOnce(new Promise((r) => (resolveCards = r)));
    fetchMock.mockResolvedValueOnce(
      sse([
        { type: 'start', messageId: 'srv1' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Which account?' },
        { type: 'text-end', id: 't1' },
        { type: 'data-offer', id: 'f9', data: { offerId: 'f9' } },
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
    expect(screen.queryByRole('group', { name: 'A few details' })).toBeNull();
    expect(document.querySelector('[data-role="assistant"] [data-slot="skeleton"]')).not.toBeNull();
    await act(async () => {
      resolveCards({
        success: true,
        data: { cards: {}, invoiceLinks: {}, forms: { f9: form({ formId: 'f9', questions: [bankQ({ questionId: 0 })] }) } },
      });
    });
    const accounts = await screen.findByRole('radiogroup', { name: 'Bank account' });
    expectOn(within(accounts).getByRole('radio', { name: 'Wise ••••7710 · USD' }));
  });
});

// ---------- sending (was: a press sends { message: label, choice }) ----------
describe('ChatIsland - Send posts the form (AC-08)', () => {
  it('posts { conversationId, message: composed text, form } with no choice, origin or startedFrom; the bubble shows the composed lines', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island({ startedFrom: 'DASHBOARD_CREATE' });
    const user = userEvent.setup();
    await answerBoth(user);
    await user.click(formSend());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = bodyOf(0);
    expect(body.conversationId).toBe('c1');
    expect(body.form).toEqual({
      formId: 'f1',
      answers: [
        { questionId: 0, optionId: 1 },
        { questionId: 1, optionId: 1 },
      ],
    });
    expect(body.message.parts[0].text).toBe(COMPOSED);
    expect(body).not.toHaveProperty('choice');
    expect(body).not.toHaveProperty('origin');
    expect(body).not.toHaveProperty('startedFrom');
    // sending: the composed lines appear at once as the Freelancer's message; the form and the composer are locked.
    const bubble = document.querySelector('[data-role="user"]:last-of-type') as HTMLElement;
    expect(bubble.textContent).toContain('Customer: Acme GmbH');
    expect(bubble.textContent).toContain('Bank account: Wise ••••7710 · USD');
    within(theForm())
      .getAllByRole('radio')
      .forEach((b) => expectOff(b));
    expect(composerSend()).toBeDisabled();
    // no optimistic marking: nothing is "Sent" before the server says so
    expect(within(theForm()).queryByText('Sent')).toBeNull();
    expect(theForm()).toHaveAttribute('data-state', 'OPEN');
    stream.end();
  });

  it('after the reply, the refreshed page marks the sent answers and reads "Sent"; the older form stays visible and read-only', async () => {
    fetchMock.mockResolvedValueOnce(answeredReply('Here is the draft for Acme GmbH.'));
    const view = island();
    const user = userEvent.setup();
    await answerBoth(user);
    await user.click(formSend());
    await screen.findByText('Here is the draft for Acme GmbH.');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    view.rerender(
      <ChatIsland
        conversationId="c1"
        initialMessages={asked}
        invoiceLinks={{}}
        cards={{}}
        forms={{ f1: sentForm() }}
        allowance={allowance(26)}
      />
    );
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chipIn('Wise ••••7710 · USD')).toHaveAttribute('aria-checked', 'true');
    expect(within(theForm()).getByText('Sent')).toBeTruthy();
    expect(within(theForm()).queryByRole('button', { name: /^send/i })).toBeNull();
    within(theForm())
      .getAllByRole('radio')
      .forEach((b) => expectOff(b));
  });

  it('on /ai the island reloads cards and forms after the reply (loadConversationCards -> forms) and the form reads "Sent"', async () => {
    mockPathname = '/ai';
    fetchMock.mockResolvedValueOnce(
      sse([
        { type: 'start', messageId: 'srv1' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'I need a few details.' },
        { type: 'text-end', id: 't1' },
        { type: 'data-offer', id: 'f1', data: { offerId: 'f1' } },
        { type: 'data-conversation', data: { conversationId: 'cNew', title: 'Draft' } },
        { type: 'data-outcome', data: { outcome: 'ANSWERED', counted: true } },
        { type: 'finish' },
      ])
    );
    loadConversationCards.mockResolvedValueOnce({
      success: true,
      data: { cards: {}, invoiceLinks: {}, forms: { f1: form() } },
    });
    render(
      <ChatIsland conversationId={null} initialMessages={[]} invoiceLinks={{}} cards={{}} allowance={allowance(27)} />
    );
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'invoice Acme for 20 hours at $50');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('group', { name: 'A few details' });
    await answerBoth(user);
    fetchMock.mockResolvedValueOnce(answeredReply('Draft ready.'));
    loadConversationCards.mockResolvedValueOnce({
      success: true,
      data: { cards: {}, invoiceLinks: {}, forms: { f1: sentForm() } },
    });
    await user.click(formSend());
    await screen.findByText('Draft ready.');
    await waitFor(() => expect(within(theForm()).getByText('Sent')).toBeTruthy());
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(bodyOf(1).form).toEqual({
      formId: 'f1',
      answers: [
        { questionId: 0, optionId: 1 },
        { questionId: 1, optionId: 1 },
      ],
    });
    expect(bodyOf(1).conversationId).toBe('cNew');
  });
});

// ---------- F8 / AC-12 / AC-40: a newer message closes the form ----------
describe('ChatIsland - a newer message closes the form (AC-12, AC-40, F8)', () => {
  it('AC-12/AC-40: a typed message while the form is half filled is sent as a typed message (no form); the form turns read-only "Not answered" and the picks are not saved', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await user.click(chipIn('Acme GmbH'));
    expectOff(formSend());
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'never mind, who owes me money?');
    await user.click(composerSend());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = bodyOf(0);
    expect(body).not.toHaveProperty('form');
    expect(body).not.toHaveProperty('choice');
    expect(body.message.parts[0].text).toBe('never mind, who owes me money?');
    within(theForm())
      .getAllByRole('radio')
      .forEach((b) => {
        expectOff(b);
        expect(b).toHaveAttribute('aria-checked', 'false');
      });
    expect(within(theForm()).getByText('Not answered')).toBeTruthy();
    expect(within(theForm()).queryByRole('button', { name: /^send/i })).toBeNull();
    stream.end();
  });

  it('AC-12: after the typed reply finishes, the earlier form still shows no answer and cannot be changed', async () => {
    fetchMock.mockResolvedValueOnce(answeredReply('Nobody owes you money.'));
    const view = island();
    const user = userEvent.setup();
    await user.click(chipIn('Acme GmbH'));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'who owes me money?');
    await user.click(composerSend());
    await screen.findByText('Nobody owes you money.');
    view.rerender(
      <ChatIsland
        conversationId="c1"
        initialMessages={[
          ...asked,
          { id: 'm3', role: 'user', origin: 'TYPED', parts: [{ type: 'text', text: 'who owes me money?' }], createdAt: '' },
          { id: 'm4', role: 'assistant', origin: null, parts: [{ type: 'text', text: 'Nobody owes you money.' }], createdAt: '' },
        ]}
        invoiceLinks={{}}
        cards={{}}
        forms={{ f1: form({ state: 'CLOSED' }) }}
        allowance={allowance(26)}
      />
    );
    within(theForm())
      .getAllByRole('radio')
      .forEach((b) => {
        expectOff(b);
        expect(b).toHaveAttribute('aria-checked', 'false');
      });
    expect(within(theForm()).getByText('Not answered')).toBeTruthy();
  });

  it('picks are not kept across a remount (reload or Conversation switch)', async () => {
    const first = island();
    const user = userEvent.setup();
    await user.click(chipIn('Acme GmbH'));
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    first.unmount();
    island();
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'false');
    expectOff(formSend());
  });
});

// ---------- refused sends (was: refused presses) ----------
describe('ChatIsland - refused form sends', () => {
  it('AC-12b/F7: 409 CHOICE_UNAVAILABLE removes the optimistic message, shows the server sentence, keeps the picks, marks nothing', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { success: false, code: 'CONFLICT', error: UNAVAILABLE, details: { kind: 'CHOICE_UNAVAILABLE' } })
    );
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await user.click(formSend());
    expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(screen.getByText('27 of 30 messages left today')).toBeTruthy();
    // SCR-03 "choice unavailable": a non-destructive alert in an assistant message, no Try again.
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(UNAVAILABLE);
    expect(notice).not.toHaveClass('text-destructive');
    expect(notice.closest('[data-role="assistant"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // picks kept, form still open, nothing marked as sent
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chipIn('Wise ••••7710 · USD')).toHaveAttribute('aria-checked', 'true');
    expectOn(formSend());
    expect(within(theForm()).queryByText('Sent')).toBeNull();
    // the composed text is never put into the box
    expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('the unavailable sentence clears on the next send, which carries the kept picks', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { success: false, code: 'CONFLICT', error: UNAVAILABLE, details: { kind: 'CHOICE_UNAVAILABLE' } })
    );
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await user.click(formSend());
    await screen.findByText(UNAVAILABLE);
    await user.click(formSend());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect((bodyOf(1) as unknown as { form: unknown }).form).toEqual({
      formId: 'f1',
      answers: [
        { questionId: 0, optionId: 1 },
        { questionId: 1, optionId: 1 },
      ],
    });
    stream.end();
  });

  it('400 VALIDATION: the field errors show under their questions, the picks are kept, the optimistic message is removed', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        success: false,
        code: 'VALIDATION',
        error: 'Check the answers.',
        fieldErrors: { 'form.answers.0': ['That option is not on this form.'] },
      })
    );
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await user.click(formSend());
    expect(await within(theForm()).findByText('That option is not on this form.')).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chipIn('Wise ••••7710 · USD')).toHaveAttribute('aria-checked', 'true');
    expect(within(theForm()).queryByText('Sent')).toBeNull();
  });

  it('T74 (R20-4): a 400 with no form.answers.<n> key still shows the VALIDATION failure, not silence', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        success: false,
        code: 'VALIDATION',
        error: 'Check the answers.',
        fieldErrors: { 'message.parts.0.text': ['Too small'], form: ['Something is off.'] },
      })
    );
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await user.click(formSend());
    expect(await screen.findByText('Check the answers.')).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
  });

  it('T74 (R20-6): while the form request is in flight the form is shown as sent: picks checked, all disabled, Send spinner, no "Not answered"', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await user.click(formSend());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chipIn('Wise ••••7710 · USD')).toHaveAttribute('aria-checked', 'true');
    within(theForm()).getAllByRole('radio').forEach((b) => expectOff(b));
    expect(within(theForm()).queryByText('Not answered')).toBeNull();
    expect(formSend().querySelector('.animate-spin')).not.toBeNull();
    expect(within(formSend()).queryByRole('status', { hidden: true })).toBeNull();
    stream.end();
  });

  it('AC-11: 429 removes the sent message, shows the used-up notice, keeps the picks, marks nothing', async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, {
        success: false,
        code: 'RATE_LIMITED',
        error: USED_UP_TEXT,
        details: { kind: 'ALLOWANCE_USED_UP', limit: 30, renewsAt: '2026-10-14T00:00:00.000Z', timeZone: 'UTC' },
      })
    );
    island({ allowance: allowance(0) });
    const user = userEvent.setup();
    // With no allowance left the form is still answerable: the server refuses (AC-11).
    await answerBoth(user);
    expectOn(formSend());
    await user.click(formSend());
    expect(await screen.findByText(USED_UP_TEXT)).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(within(theForm()).queryByText('Sent')).toBeNull();
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chipIn('Wise ••••7710 · USD')).toHaveAttribute('aria-checked', 'true');
  });

  it('could-not-complete after Send: the picks are kept, the form is answerable again and "Try again" re-sends the same form', async () => {
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
    await answerBoth(user);
    await user.click(formSend());
    expect(await screen.findByText(COULD_NOT)).toBeTruthy();
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chipIn('Wise ••••7710 · USD')).toHaveAttribute('aria-checked', 'true');
    expectOn(formSend());
    const failed = screen.getByRole('alert').closest('[data-role="assistant"]') as HTMLElement;
    expect(failed).not.toBeNull();
    await user.click(within(failed).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((bodyOf(1) as unknown as { form: unknown }).form).toEqual({
      formId: 'f1',
      answers: [
        { questionId: 0, optionId: 1 },
        { questionId: 1, optionId: 1 },
      ],
    });
    expect(bodyOf(1).message.parts[0].text).toBe(COMPOSED);
    expect(bodyOf(1)).not.toHaveProperty('choice');
    stream.end();
  });
});

// ---------- reopen (AC-13) ----------
describe('Reopen (AC-13)', () => {
  it('/ai/[id] passes the stored forms: the sent answers are marked and the form reads "Sent" on reopen', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Invoice Acme' },
        messages: [
          ...asked,
          { id: 'm3', role: 'user', origin: 'FORM', parts: [{ type: 'text', text: COMPOSED }], createdAt: '' },
        ],
        invoiceLinks: {},
        cards: {},
        forms: { f1: sentForm() },
      },
    });
    render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chipIn('Wise ••••7710 · USD')).toHaveAttribute('aria-checked', 'true');
    expect(within(theForm()).getByText('Sent')).toBeTruthy();
    expectOff(chipIn('Acme GmbH'));
  });

  it('a latest reply with nothing answered is still answerable on reopen, with no picks', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Invoice Acme' },
        messages: asked,
        invoiceLinks: {},
        cards: {},
        forms: { f1: form() },
      },
    });
    render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
    expectOn(chipIn('Acme GmbH'));
    expect(chipIn('Acme GmbH')).toHaveAttribute('aria-checked', 'false');
    expectOff(formSend());
  });
});
