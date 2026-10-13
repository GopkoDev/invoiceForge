// @vitest-environment jsdom
// T59 (ai-chat-v2; AC-08b, AC-12, AC-13, AC-38, AC-40) - SCR-04 revision 2026-10-13 Question form, every state.
//
// Seam: components/ai/question-form.tsx -> QuestionForm({ form: FormView | undefined, isLatest, pending,
//   invoiceCurrency?, onSend(formId, answers, composedText), fieldErrors?: Record<'form.answers.<id>', string[]> }).
//   Chips: role="radiogroup" > role="radio" (aria-checked); a chip that can't be pressed is aria-disabled.
//   Send: a button named "Send", aria-disabled until every required question has a valid answer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuestionForm } from '@/components/ai/question-form';
import { composeAnswerMessage } from '@/lib/validations/form-answers';
import type { FormQuestionView, FormView } from '@/types/assistant/types';

afterEach(cleanup);

const expectOff = (b: HTMLElement) => expect(b).toHaveAttribute('aria-disabled', 'true');
const expectOn = (b: HTMLElement) => expect(b).not.toHaveAttribute('aria-disabled', 'true');

const customerQ = (over: Partial<FormQuestionView> = {}): FormQuestionView => ({
  questionId: 0,
  field: 'CUSTOMER',
  lineIndex: null,
  heading: 'Customer',
  prompt: 'Which Customer is this invoice for?',
  options: [
    { optionId: 0, label: 'Acme Corp' },
    { optionId: 1, label: 'Acme GmbH' },
  ],
  input: 'TEXT',
  required: true,
  skippable: false,
  matchCount: null,
  ...over,
});
const priceQ = (over: Partial<FormQuestionView> = {}): FormQuestionView => ({
  questionId: 1,
  field: 'PRICE',
  lineIndex: 0,
  heading: 'Line 1 · Price',
  prompt: 'What is the hourly rate for web dev?',
  options: [],
  input: 'AMOUNT',
  required: true,
  skippable: false,
  matchCount: null,
  ...over,
});
const notesQ = (over: Partial<FormQuestionView> = {}): FormQuestionView => ({
  questionId: 2,
  field: 'NOTES',
  lineIndex: null,
  heading: 'Notes',
  prompt: null,
  options: [],
  input: 'TEXT',
  required: false,
  skippable: true,
  matchCount: null,
  ...over,
});
const makeForm = (questions: FormQuestionView[], over: Partial<FormView> = {}): FormView => ({
  formId: 'f1',
  state: 'OPEN',
  questions,
  answers: null,
  ...over,
});
const renderForm = (form: FormView | undefined, props: Partial<Parameters<typeof QuestionForm>[0]> = {}) => {
  const onSend = vi.fn();
  render(<QuestionForm form={form} isLatest pending={false} onSend={onSend} {...props} />);
  return { onSend, user: userEvent.setup() };
};
const send = () => screen.getByRole('button', { name: /^send/i });
const chip = (name: string | RegExp) => screen.getByRole('radio', { name });

describe('labels loading', () => {
  it('shows a h-40 skeleton and no Send while the form is undefined', () => {
    const { container } = render(<QuestionForm form={undefined} isLatest pending={false} onSend={vi.fn()} />);
    expect(container.querySelector('[data-slot="skeleton"]')?.className ?? container.innerHTML).toContain('h-40');
    expect(screen.queryByRole('button', { name: /^send/i })).toBeNull();
  });
});

describe('unanswered', () => {
  it('renders heading, plain-text prompt, chips, Other and a disabled Send with 0 of N', () => {
    renderForm(makeForm([customerQ(), priceQ()]));
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Which Customer is this invoice for?')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup');
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Acme Corp', 'Acme GmbH', 'Other…']);
    expectOff(send());
    expect(screen.getByText('0 of 2 answered')).toBeInTheDocument();
  });

  it('marks an optional question with Optional', () => {
    renderForm(makeForm([customerQ(), notesQ()]));
    expect(screen.getByText(/Notes.*Optional/i)).toBeInTheDocument();
  });

  it('renders a prompt with markup, bold or a URL as literal text', () => {
    const prompt = '**bold** <b>x</b> https://evil.example/a';
    const { container } = render(
      <QuestionForm form={makeForm([customerQ({ prompt })])} isLatest pending={false} onSend={vi.fn()} />
    );
    expect(container.textContent).toContain(prompt);
    expect(container.querySelector('strong, b, a')).toBeNull();
  });

  it('has no Other chip for an options-only question', () => {
    renderForm(makeForm([customerQ({ input: 'NONE' })]));
    expect(screen.queryByRole('radio', { name: 'Other…' })).toBeNull();
  });
});

describe('partially filled and ready (AC-08b, AC-40)', () => {
  it('updates the counter and keeps Send disabled until every required question is answered', async () => {
    const { user } = renderForm(makeForm([customerQ(), priceQ()]));
    await user.click(chip('Acme GmbH'));
    expect(chip('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
    expectOff(send());
    await user.type(screen.getByRole('textbox'), '40');
    expect(screen.getByText('2 of 2 answered')).toBeInTheDocument();
    expectOn(send());
  });

  it('moves between chips with the arrow keys', async () => {
    const { user } = renderForm(makeForm([customerQ({ input: 'NONE' })]));
    chip('Acme Corp').focus();
    await user.keyboard('{ArrowRight}');
    expect(chip('Acme GmbH')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(chip('Acme Corp')).toHaveFocus();
  });

  it('does not require an optional question', async () => {
    const { user } = renderForm(makeForm([customerQ(), notesQ()]));
    await user.click(chip('Acme Corp'));
    expectOn(send());
  });
});

describe('Other input', () => {
  it('reveals and focuses the input on Other…, Escape hides and clears it, an option hides it', async () => {
    const { user } = renderForm(makeForm([customerQ()]));
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(chip('Other…'));
    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
    expect(chip('Other…')).toHaveAttribute('aria-checked', 'true');
    await user.type(input, 'Оohn  Doe');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(chip('Other…'));
    expect(screen.getByRole('textbox')).toHaveValue('');
    await user.click(chip('Acme Corp'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('input-only question', () => {
  it('shows the input directly and the match helper (AC-14)', () => {
    renderForm(makeForm([customerQ({ options: [], matchCount: 7 })]));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText('7 match. Type a more exact name.')).toBeInTheDocument();
  });
});

describe('field invalid (AC-38)', () => {
  it.each(['forty', '-5'])('rejects %s as a price, linked to the input, Send disabled', async (typed) => {
    const { user } = renderForm(makeForm([priceQ()]));
    const input = screen.getByRole('textbox');
    await user.type(input, typed);
    await user.tab();
    const message = await screen.findByText('Enter a number greater than 0, with at most 2 decimals.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(message.id);
    expectOff(send());
    await user.clear(input);
    await user.type(input, '40');
    await user.tab();
    expect(screen.queryByText('Enter a number greater than 0, with at most 2 decimals.')).toBeNull();
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expectOn(send());
  });

  it('checks a rate, a discount and a too-long note', async () => {
    const { user } = renderForm(
      makeForm([
        priceQ({ questionId: 0, field: 'TAX_RATE', input: 'RATE', heading: 'Tax' }),
        priceQ({ questionId: 1, field: 'DISCOUNT', input: 'DISCOUNT', heading: 'Discount' }),
        notesQ({ questionId: 2, required: true, skippable: false }),
      ])
    );
    const [rate, discount, notes] = screen.getAllByRole('textbox');
    await user.type(rate, '101');
    await user.type(discount, 'abc');
    await user.click(notes);
    await user.paste('x'.repeat(2001));
    await user.tab();
    expect(await screen.findByText('Enter a rate from 0 to 100.')).toBeInTheDocument();
    expect(screen.getByText('Enter 0 or more, with at most 2 decimals.')).toBeInTheDocument();
    expect(screen.getByText('Keep it under 2000 characters.')).toBeInTheDocument();
    expectOff(send());
  });

  it('shows a server 400 field error under that question', () => {
    renderForm(makeForm([customerQ(), priceQ()]), { fieldErrors: { 'form.answers.1': ['Enter a number greater than 0, with at most 2 decimals.'] } });
    const message = screen.getByText('Enter a number greater than 0, with at most 2 decimals.');
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toContain(message.id);
  });

  it('offers a date control for a DATE question that is not a free-text box', () => {
    renderForm(makeForm([priceQ({ field: 'ISSUE_DATE', input: 'DATE', heading: 'Issue date' })]));
    expect(screen.getByRole('button', { name: /date/i })).toBeInTheDocument();
  });
});

describe('skip', () => {
  it('counts a Skip chip as an answer', async () => {
    const { user } = renderForm(makeForm([customerQ({ input: 'NONE', required: false, skippable: true })]));
    await user.click(chip('Skip'));
    expect(chip('Skip')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/^1 of \d+ answered$/)).toBeInTheDocument();
  });
});

describe('send', () => {
  it('calls onSend with the structured answers and the composed text', async () => {
    const questions = [customerQ(), priceQ(), notesQ()];
    const { onSend, user } = renderForm(makeForm(questions));
    await user.click(chip('Acme GmbH'));
    await user.type(screen.getAllByRole('textbox')[0], '40');
    await user.click(send());
    const answers = [
      { questionId: 0, optionId: 1 },
      { questionId: 1, text: '40' },
    ];
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('f1', answers, composeAnswerMessage(questions, answers));
    expect(onSend.mock.calls[0][2]).toBe('Customer: Acme GmbH\nLine 1 · Price: 40');
  });

  it('sends {skipped:true} for a skip', async () => {
    const questions = [
      customerQ({ input: 'NONE' }),
      customerQ({
        questionId: 1,
        field: 'FREE',
        heading: 'Note',
        options: [{ optionId: 0, label: 'Net 30' }],
        input: 'NONE',
        required: false,
        skippable: true,
      }),
    ];
    const { onSend, user } = renderForm(makeForm(questions));
    await user.click(chip('Acme Corp'));
    expect(screen.getByText('1 of 1 answered')).toBeInTheDocument();
    await user.click(chip('Skip'));
    expect(screen.getByText('1 of 1 answered')).toBeInTheDocument();
    await user.click(send());
    expect(onSend.mock.calls[0][1]).toEqual([
      { questionId: 0, optionId: 0 },
      { questionId: 1, skipped: true },
    ]);
  });

  it('does not send while a required question is open', async () => {
    const { onSend, user } = renderForm(makeForm([customerQ()]));
    await user.click(send());
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('disables the form and Send and shows a spinner while pending', () => {
    renderForm(makeForm([customerQ()]), { pending: true });
    expectOff(send());
    expectOff(chip('Acme Corp'));
    expect(within(send()).getByRole('status', { hidden: true })).toBeInTheDocument();
  });
});

describe('answered read-only (AC-12, AC-13)', () => {
  const answered = (answers: NonNullable<FormView['answers']>, questions = [customerQ(), priceQ(), notesQ()]) =>
    makeForm(questions, { state: 'CHOSEN', answers });

  it('marks the picked chip, disables the rest, quotes typed text, says Skipped, Sent, no inputs or Send', () => {
    renderForm(
      answered([
        { questionId: 0, optionId: 1 },
        { questionId: 1, text: '40' },
        { questionId: 2, skipped: true },
      ])
    );
    expect(chip('Acme GmbH')).toHaveAttribute('aria-checked', 'true');
    expect(chip('Acme Corp')).toHaveAttribute('aria-checked', 'false');
    expectOff(chip('Acme Corp'));
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^send/i })).toBeNull();
  });

  it('is read-only when it is no longer the latest reply', () => {
    renderForm(answered([{ questionId: 0, optionId: 0 }], [customerQ()]), { isLatest: false });
    expect(chip('Acme Corp')).toHaveAttribute('aria-checked', 'true');
    expectOff(chip('Acme GmbH'));
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });
});

describe('closed read-only (AC-12, AC-40)', () => {
  it.each([
    ['CLOSED and latest', 'CLOSED' as const, true],
    ['OPEN but not latest', 'OPEN' as const, false],
  ])('%s: chips disabled, nothing marked, no inputs, Not answered', (_n, state, isLatest) => {
    renderForm(makeForm([customerQ(), priceQ()], { state }), { isLatest });
    for (const r of screen.getAllByRole('radio')) {
      expectOff(r);
      expect(r).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Not answered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^send/i })).toBeNull();
  });
});

describe('legacy one-question form (F9a)', () => {
  it('renders and answers like any form', async () => {
    const q = customerQ({ input: 'NONE', prompt: null });
    const { onSend, user } = renderForm(makeForm([q]));
    await user.click(chip('Acme Corp'));
    await user.click(send());
    expect(onSend).toHaveBeenCalledWith('f1', [{ questionId: 0, optionId: 0 }], 'Customer: Acme Corp');
  });
});

describe('long labels', () => {
  it('keeps the full label in title', () => {
    const label = 'A very long customer name '.repeat(8).trim();
    renderForm(makeForm([customerQ({ options: [{ optionId: 0, label }] })]));
    expect(chip(label)).toHaveAttribute('title', label);
  });
});
