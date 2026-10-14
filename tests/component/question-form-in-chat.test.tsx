// @vitest-environment jsdom
// T79 (ai-chat-v2; AC-55, AC-56) - the Question form docked above the composer in ChatIsland.
// Rewrites T60's under-the-reply cases (removed: form-in-reply-column, Send-button flows, "Not answered" read-only
// chips, 409/400/429 chip-state cases that drove the old Send button; server-contract cases live in the integration suite).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
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
vi.mock('@/components/ai/draft-card', () => ({ DraftCard: () => <div /> }));

import { ChatIsland } from '@/components/ai/chat-island';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { ConversationMessageView, FormQuestionView, FormView } from '@/types/assistant/types';

const UNAVAILABLE = 'This form is no longer available. Answer the latest questions or type your request.';
const USED_UP_TEXT =
  "You've used today's 30 messages. They renew at 00:00 your time. An AI client connected with a Personal key isn't affected.";
const COULD_NOT = "The reply couldn't be completed. Try again.";
const COMPOSED = 'Which Customer is this invoice for? — Acme GmbH\nWhich bank account should the invoice use? — Wise';

const customerQ = (): FormQuestionView => ({
  questionId: 0,
  field: 'CUSTOMER',
  lineIndex: null,
  prompt: 'Which Customer is this invoice for?',
  options: [
    { optionId: 0, label: 'Acme Corp' },
    { optionId: 1, label: 'Acme GmbH' },
  ],
  input: 'TEXT',
  required: true,
  skippable: false,
  matchCount: null,
});
const bankQ = (): FormQuestionView => ({
  questionId: 1,
  field: 'BANK_ACCOUNT',
  lineIndex: null,
  prompt: 'Which bank account should the invoice use?',
  options: [
    { optionId: 0, label: 'Monobank' },
    { optionId: 1, label: 'Wise' },
  ],
  input: 'NONE',
  required: true,
  skippable: false,
  matchCount: null,
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

const asked: ConversationMessageView[] = [
  { id: 'm1', role: 'user', origin: 'TYPED', parts: [{ type: 'text', text: 'invoice Acme for 20 hours' }], createdAt: '' },
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
const allowance: AllowanceState = { limit: 30, used: 3, left: 27, renewsAt: '2026-10-14T00:00:00.000Z', timeZone: 'UTC' };

const fetchMock = vi.fn();
function openStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
    }),
    end: () => {
      ctrl.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  };
}
const bodyOf = (call: number) =>
  JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body)) as Record<string, unknown> & {
    message: { parts: Array<{ text: string }> };
  };

function island(forms: Record<string, FormView> = { f1: form() }, left = allowance) {
  return render(
    <ChatIsland conversationId="c1" initialMessages={asked} invoiceLinks={{}} cards={{}} forms={forms} allowance={left} />
  );
}
const dock = () => document.querySelector('[data-slot="composer-dock"]') as HTMLElement;
const questionDock = () => document.querySelector('[data-slot="question-dock"]') as HTMLElement | null;

const sseHeaders = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' };
const sse = (chunks: unknown[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', {
    status: 200,
    headers: sseHeaders,
  });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answeredReply = (text: string) =>
  sse([
    { type: 'start', messageId: 'srv1' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'data-outcome', data: { outcome: 'ANSWERED', counted: true } },
    { type: 'finish' },
  ]);
const unavailable = () =>
  json(409, { success: false, code: 'CONFLICT', error: UNAVAILABLE, details: { kind: 'CHOICE_UNAVAILABLE' } });
const withAllowance = (left: number): AllowanceState => ({ ...allowance, used: 30 - left, left });
const radio = (name: string | RegExp) => within(questionDock()!).getByRole('radio', { name });
async function answerBoth(user: ReturnType<typeof userEvent.setup>) {
  await user.click(radio(/Acme GmbH/));
  await user.click(radio(/Wise/));
}
const BOTH = {
  formId: 'f1',
  answers: [
    { questionId: 0, optionId: 1 },
    { questionId: 1, optionId: 1 },
  ],
};

beforeEach(() => {
  mockPathname = '/ai/c1';
  refresh.mockReset();
  loadConversationCards.mockReset();
  loadConversationCards.mockResolvedValue({ success: true, data: { cards: {}, invoiceLinks: {}, forms: {} } });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ChatIsland - question dock (AC-55, AC-56)', () => {
  it('components/ai/offered-choices.tsx stays gone', () => {
    expect(existsSync(join(process.cwd(), 'components/ai/offered-choices.tsx'))).toBe(false);
  });

  it('docks the open form inside composer-dock, above the composer, and not in the message stream', () => {
    island();
    const q = questionDock();
    expect(q).not.toBeNull();
    expect(dock().contains(q)).toBe(true);
    expect(q!.closest('[data-slot="chat-scroll"]')).toBeNull();
    expect(within(q!).getByText('Which Customer is this invoice for?')).toBeInTheDocument();
    const composer = within(dock()).getByRole('textbox', { name: 'Message' });
    expect(q!.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the reply text stays in the stream
    expect(screen.getByText('I need a few details.').closest('[data-slot="chat-scroll"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="chat-scroll"] [data-slot="question-form"]')).toBeNull();
  });

  it('a sent (CHOSEN) form renders nothing, neither in the stream nor docked', () => {
    island({ f1: sentForm() });
    expect(screen.getByText('I need a few details.')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="question-form"]')).toBeNull();
    expect(questionDock()?.querySelector('[data-slot="question-form"]') ?? null).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('answering every question in the dock posts { form, composed message } once', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await user.click(within(questionDock()!).getByRole('radio', { name: /Acme GmbH/ }));
    await user.click(within(questionDock()!).getByRole('radio', { name: /Wise/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = bodyOf(0);
    expect(body.form).toEqual({
      formId: 'f1',
      answers: [
        { questionId: 0, optionId: 1 },
        { questionId: 1, optionId: 1 },
      ],
    });
    expect(body.message.parts[0].text).toBe(COMPOSED);
    expect(body).not.toHaveProperty('choice');
    stream.end();
  });

  it('typing in the composer still works with the form open and sends a typed message (no form)', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    const composer = screen.getByRole('textbox', { name: 'Message' });
    await user.type(composer, 'never mind');
    expect(composer).toHaveValue('never mind');
    await user.click(within(dock()).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).not.toHaveProperty('form');
    expect(bodyOf(0).message.parts[0].text).toBe('never mind');
    stream.end();
  });

  it('× hides the dock without sending; the composer stays usable', async () => {
    island();
    const user = userEvent.setup();
    await user.click(within(questionDock()!).getByRole('button', { name: 'Close questions' }));
    expect(questionDock()?.querySelector('[data-slot="question-form"]') ?? null).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'hello');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('hello');
  });

  it('× moves focus to the Message box (T86)', async () => {
    island();
    const user = userEvent.setup();
    await user.click(within(questionDock()!).getByRole('button', { name: 'Close questions' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
  });
});

describe('ChatIsland - after a send (AC-55, AC-08)', () => {
  it('while the request is in flight: the composed lines show as the Freelancer message; the dock is hidden (no radios, no "Sending…")', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const bubble = document.querySelector('[data-role="user"]:last-of-type') as HTMLElement;
    expect(bubble.textContent).toContain('Which Customer is this invoice for? — Acme GmbH');
    expect(bubble.textContent).toContain('Which bank account should the invoice use? — Wise');
    const q = questionDock();
    if (q) expect(q).not.toBeVisible();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText('Sending…')).toBeNull();
    stream.end();
  });

  it('after the reply the loaded forms mark the form sent and the dock is gone; no router.refresh', async () => {
    loadConversationCards.mockResolvedValue({ success: true, data: { cards: {}, invoiceLinks: {}, forms: { f1: sentForm() } } });
    fetchMock.mockResolvedValueOnce(answeredReply('Here is the draft for Acme GmbH.'));
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await screen.findByText('Here is the draft for Acme GmbH.');
    await waitFor(() => expect(loadConversationCards).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(questionDock()).toBeNull());
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('on /ai the island reloads the forms after the reply, docks the form, and the second send posts to the saved Conversation', async () => {
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
    loadConversationCards.mockResolvedValueOnce({ success: true, data: { cards: {}, invoiceLinks: {}, forms: { f1: form() } } });
    render(<ChatIsland conversationId={null} initialMessages={[]} invoiceLinks={{}} cards={{}} allowance={allowance} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'invoice Acme for 20 hours');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(questionDock()).not.toBeNull());
    await waitFor(() => expect(within(questionDock()!).queryByRole('radio', { name: /Acme GmbH/ })).not.toBeNull());
    fetchMock.mockResolvedValueOnce(answeredReply('Draft ready.'));
    await answerBoth(user);
    await screen.findByText('Draft ready.');
    expect(bodyOf(1).form).toEqual(BOTH);
    expect(bodyOf(1).conversationId).toBe('cNew');
  });

  it('labels loading: a skeleton in the dock until the FormView arrives (/ai)', async () => {
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
    render(<ChatIsland conversationId={null} initialMessages={[]} invoiceLinks={{}} cards={{}} allowance={allowance} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'invoice Acme GmbH');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Which account?');
    await waitFor(() => expect(loadConversationCards).toHaveBeenCalledWith('cNew'));
    expect(screen.queryByRole('radio')).toBeNull();
    expect(questionDock()!.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    await act(async () => {
      resolveCards({
        success: true,
        data: { cards: {}, invoiceLinks: {}, forms: { f9: form({ formId: 'f9', questions: [bankQ()] }) } },
      });
    });
    expect(await within(questionDock()!).findByRole('radio', { name: /Wise/ })).toBeInTheDocument();
  });
});

describe('ChatIsland - a newer message closes the form (AC-12, AC-40, F8)', () => {
  it('a typed message while the form is half filled is sent without the form; the dock goes and the picks are not saved', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await user.click(radio(/Acme GmbH/));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'never mind, who owes me money?');
    await user.click(within(dock()).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).not.toHaveProperty('form');
    expect(bodyOf(0)).not.toHaveProperty('choice');
    expect(bodyOf(0).message.parts[0].text).toBe('never mind, who owes me money?');
    expect(screen.queryByRole('radio')).toBeNull();
    stream.end();
  });

  it('after the typed reply finishes, the earlier form stays closed and cannot be answered', async () => {
    fetchMock.mockResolvedValueOnce(answeredReply('Nobody owes you money.'));
    const view = island();
    const user = userEvent.setup();
    await user.click(radio(/Acme GmbH/));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'who owes me money?');
    await user.click(within(dock()).getByRole('button', { name: 'Send' }));
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
        allowance={withAllowance(26)}
      />
    );
    expect(screen.queryByRole('radio')).toBeNull();
    expect(questionDock()).toBeNull();
  });

  it('picks are not kept across a remount (reload or Conversation switch)', async () => {
    const first = island();
    const user = userEvent.setup();
    await user.click(radio(/Acme GmbH/));
    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(radio(/Acme GmbH/)).toHaveAttribute('aria-checked', 'true');
    first.unmount();
    island();
    expect(radio(/Acme GmbH/)).toHaveAttribute('aria-checked', 'false');
  });
});

describe('ChatIsland - refused form sends', () => {
  it('AC-12b/F7: 409 CHOICE_UNAVAILABLE removes the optimistic message, shows the server sentence, keeps the picks, marks nothing', async () => {
    fetchMock.mockResolvedValueOnce(unavailable());
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(screen.getByText('27 of 30 messages left today')).toBeTruthy();
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(UNAVAILABLE);
    expect(notice).not.toHaveClass('text-destructive');
    expect(notice.closest('[data-role="assistant"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // picks kept, the form is open and answerable again
    expect(radio(/Wise/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/Wise/)).not.toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(radio(/Acme GmbH/)).toHaveAttribute('aria-checked', 'true');
    expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('the unavailable sentence clears on the next send, which carries the kept picks', async () => {
    fetchMock.mockResolvedValueOnce(unavailable());
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await screen.findByText(UNAVAILABLE);
    await user.click(radio(/Wise/));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(bodyOf(1).form).toEqual(BOTH);
    stream.end();
  });

  it('400 VALIDATION: the field error shows under its question, the picks are kept, the optimistic message is removed', async () => {
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
    expect(await within(questionDock()!).findByText('That option is not on this form.')).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(radio(/Acme GmbH/)).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(radio(/Wise/)).toHaveAttribute('aria-checked', 'true');
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
    expect(await screen.findByText('Check the answers.')).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(radio(/Wise/)).toHaveAttribute('aria-checked', 'true');
  });

  it('AC-11: 429 removes the sent message, shows the used-up notice, keeps the picks; the form is still answerable with no allowance left', async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, {
        success: false,
        code: 'RATE_LIMITED',
        error: USED_UP_TEXT,
        details: { kind: 'ALLOWANCE_USED_UP', limit: 30, renewsAt: '2026-10-14T00:00:00.000Z', timeZone: 'UTC' },
      })
    );
    island({ f1: form() }, withAllowance(0));
    const user = userEvent.setup();
    expect(questionDock()).not.toBeNull();
    await answerBoth(user);
    expect(await screen.findByText(USED_UP_TEXT)).toBeTruthy();
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(radio(/Wise/)).toHaveAttribute('aria-checked', 'true');
  });

  it('could-not-complete after the last answer: the picks are kept, the form is answerable again and "Try again" re-sends the same form', async () => {
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
    expect(await screen.findByText(COULD_NOT)).toBeTruthy();
    expect(radio(/Wise/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/Wise/)).not.toBeDisabled();
    const failed = screen.getByRole('alert').closest('[data-role="assistant"]') as HTMLElement;
    await user.click(within(failed).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).form).toEqual(BOTH);
    expect(bodyOf(1).message.parts[0].text).toBe(COMPOSED);
    expect(bodyOf(1)).not.toHaveProperty('choice');
    stream.end();
  });
});

describe('ChatIsland - hidden while sending (R2, T82; AC-55)', () => {
  const inFlight = async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const q = questionDock();
    if (q) expect(q).not.toBeVisible();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    return { resolve, user };
  };

  it('a 400 with form.answers.* errors brings the dock back with the error and the picks intact', async () => {
    const { resolve } = await inFlight();
    await act(async () => {
      resolve(
        json(400, {
          success: false,
          code: 'VALIDATION',
          error: 'Check the answers.',
          fieldErrors: { 'form.answers.0': ['That option is not on this form.'] },
        })
      );
    });
    expect(await within(questionDock()!).findByText('That option is not on this form.')).toBeTruthy();
    expect(questionDock()).toBeVisible();
    // the form jumps to the first errored question (the Customer one); its pick is kept
    expect(radio(/Acme GmbH/)).toHaveAttribute('aria-checked', 'true');
  });

  it('a 409 for the form brings the dock back with the server sentence and radios', async () => {
    const { resolve } = await inFlight();
    await act(async () => resolve(unavailable()));
    await screen.findByText(UNAVAILABLE);
    expect(questionDock()).toBeVisible();
    expect(within(questionDock()!).getAllByRole('radio').length).toBeGreaterThan(0);
  });

  it('a network failure brings the dock back answerable with the picks kept', async () => {
    let reject!: (e: Error) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((_, r) => (reject = r)));
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    await act(async () => reject(new TypeError('Failed to fetch')));
    await waitFor(() => expect(screen.queryAllByRole('radio').length).toBeGreaterThan(0));
    expect(questionDock()).toBeVisible();
    expect(radio(/Wise/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/Wise/)).not.toBeDisabled();
  });

  it('focus: in flight it is not inside the dock; after the reply it is on the Message textbox', async () => {
    loadConversationCards.mockResolvedValue({ success: true, data: { cards: {}, invoiceLinks: {}, forms: { f1: sentForm() } } });
    const stream = openStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    island();
    const user = userEvent.setup();
    await answerBoth(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const q = questionDock();
    if (q) expect(q.contains(document.activeElement)).toBe(false);
    await act(async () => stream.end());
    await waitFor(() => expect(questionDock()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Message' })));
  });

  it('focus: after a failed send it is on the Message textbox, not in the hidden dock', async () => {
    const { resolve } = await inFlight();
    await act(async () => resolve(unavailable()));
    await screen.findByText(UNAVAILABLE);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Message' })));
  });
});

describe('Reopen (AC-13)', () => {
  const page = async (forms: Record<string, FormView>, extra: ConversationMessageView[] = []) => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Invoice Acme' },
        messages: [...asked, ...extra],
        invoiceLinks: {},
        cards: {},
        forms,
      },
    });
    render(await ConversationPage({ params: Promise.resolve({ conversationId: 'c1' }) }));
  };

  it('/ai/[id] with a sent form shows no dock on reopen', async () => {
    await page({ f1: sentForm() }, [{ id: 'm3', role: 'user', origin: 'FORM', parts: [{ type: 'text', text: COMPOSED }], createdAt: '' }]);
    expect(screen.getByText('I need a few details.')).toBeInTheDocument();
    expect(questionDock()).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('a latest reply with nothing answered is still answerable on reopen, with no picks', async () => {
    await page({ f1: form() });
    expect(radio(/Acme GmbH/)).toHaveAttribute('aria-checked', 'false');
    expect(radio(/Acme GmbH/)).not.toBeDisabled();
  });
});
