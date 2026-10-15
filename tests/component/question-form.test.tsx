// @vitest-environment jsdom
// T79 (ai-chat-v2; AC-55, AC-56; SCR-04 "Superseded in layout 2026-10-14") - the docked, one-question-at-a-time form.
// Rewrites T59's all-at-once chips + Send-button cases (removed: "N of M answered", Send enabled/disabled, chip
// aria-disabled, answered/closed read-only chips, unit suffix, axe label sweep) - a sent or closed form now renders nothing.
//
// Seam: QuestionForm({ form, isLatest, onSend(formId, answers, composedText), fieldErrors?, onClose? }).
//   Header: question text (prompt, else heading) + pager (Previous question / "1 of N" / Next question / Close questions).
//   Options: role="radiogroup" > role="radio" rows (number badge, label, option.detail). Last row "Something else" -> inline input.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuestionForm } from '@/components/ai/question-form';
import { composeAnswerMessage } from '@/lib/validations/form-answers';
import type { FormQuestionView, FormView } from '@/types/assistant/types';

afterEach(cleanup);

const customerQ = (over: Partial<FormQuestionView> = {}): FormQuestionView =>
  ({
    questionId: 0,
    field: 'CUSTOMER',
    lineIndex: null,
    prompt: 'Which Customer is this invoice for?',
    options: [
      { optionId: 0, label: 'Acme Corp', detail: 'billing@acme.com' },
      { optionId: 1, label: 'Acme GmbH', detail: 'Berlin' },
    ],
    input: 'TEXT',
    required: true,
    skippable: false,
    matchCount: null,
    ...over,
  }) as FormQuestionView;
const bankQ = (over: Partial<FormQuestionView> = {}): FormQuestionView =>
  customerQ({
    questionId: 1,
    field: 'BANK_ACCOUNT',
    prompt: 'Which bank account should the invoice use?',
    options: [
      { optionId: 0, label: 'Monobank' },
      { optionId: 1, label: 'Wise' },
    ],
    input: 'NONE',
    ...over,
  });
const notesQ = (over: Partial<FormQuestionView> = {}): FormQuestionView =>
  customerQ({
    questionId: 2,
    field: 'NOTES',
    prompt: null,
    options: [{ optionId: 0, label: 'Net 30' }],
    input: 'NONE',
    required: false,
    skippable: true,
    ...over,
  });
const priceQ = (over: Partial<FormQuestionView> = {}): FormQuestionView =>
  customerQ({
    questionId: 1,
    field: 'PRICE',
    lineIndex: 0,
    prompt: 'What is the hourly rate for web dev?',
    options: [],
    input: 'AMOUNT',
    ...over,
  });
const makeForm = (questions: FormQuestionView[], over: Record<string, unknown> = {}): FormView =>
  ({ formId: 'f1', state: 'OPEN', questions, answers: null, ...over }) as FormView;
const three = () => [customerQ(), bankQ(), notesQ()];

const renderForm = (form: FormView | undefined, props: Record<string, unknown> = {}) => {
  const onSend = vi.fn();
  const onClose = vi.fn();
  const view = render(<QuestionForm form={form} isLatest onSend={onSend} {...({ onClose } as object)} {...props} />);
  return { onSend, onClose, user: userEvent.setup(), ...view };
};
const row = (name: string | RegExp) => screen.getByRole('radio', { name });

describe('one question at a time (AC-55)', () => {
  it('shows a skeleton while the labels load', () => {
    const { container } = renderForm(undefined);
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  it('shows only the current question, its pager, and numbered rows with the detail line', () => {
    renderForm(makeForm(three()));
    expect(screen.getByText('Which Customer is this invoice for?')).toBeInTheDocument();
    expect(screen.queryByText('Which bank account should the invoice use?')).toBeNull();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous question' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close questions' })).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Which Customer is this invoice for?' });
    const rows = within(group).getAllByRole('radio');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/1.*Acme Corp.*billing@acme\.com/);
    expect(rows[1]).toHaveTextContent(/2.*Acme GmbH.*Berlin/);
    expect(rows[2]).toHaveTextContent('Something else');
  });

  it('hides the pager when there is a single question', () => {
    renderForm(makeForm([bankQ()]));
    expect(screen.queryByRole('button', { name: 'Previous question' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next question' })).toBeNull();
    expect(screen.queryByText(/of 1/)).toBeNull();
  });

  it('picking advances to the next question; Previous shows the pick as checked', async () => {
    const { user, onSend } = renderForm(makeForm(three()));
    await user.click(row(/Acme GmbH/));
    expect(screen.getByText('Which bank account should the invoice use?')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(row(/Acme GmbH/)).toHaveAttribute('aria-checked', 'true');
    expect(row(/Acme Corp/)).toHaveAttribute('aria-checked', 'false');
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('sending (AC-55, contract unchanged)', () => {
  it('calls onSend exactly once, after the last answer, with all answers and the composed text', async () => {
    const questions = three();
    const { user, onSend } = renderForm(makeForm(questions));
    await user.click(row(/Acme GmbH/));
    await user.click(row(/Wise/));
    expect(onSend).not.toHaveBeenCalled();
    await user.click(row(/Net 30/));
    const answers = [
      { questionId: 0, optionId: 1 },
      { questionId: 1, optionId: 1 },
      { questionId: 2, optionId: 0 },
    ];
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('f1', answers, composeAnswerMessage(questions, answers));
  });

  it('Skip answers a skippable question with {skipped:true}', async () => {
    const questions = [bankQ(), notesQ()];
    const { user, onSend } = renderForm(makeForm(questions));
    await user.click(row(/Wise/));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][1]).toEqual([{ questionId: 1, optionId: 1 }, { questionId: 2, skipped: true }]);
  });

  it('jumps to the first unanswered required question instead of sending', async () => {
    const { user, onSend } = renderForm(makeForm(three()));
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(row(/Wise/));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('Which Customer is this invoice for?')).toBeInTheDocument();
    await user.click(row(/Acme Corp/));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][1]).toEqual([
      { questionId: 0, optionId: 0 },
      { questionId: 1, optionId: 1 },
      { questionId: 2, skipped: true },
    ]);
  });
});

describe('keyboard (AC-55)', () => {
  it('arrow keys move focus, Enter picks the focused row', async () => {
    const { user, onSend } = renderForm(makeForm([bankQ()]));
    row(/Monobank/).focus();
    await user.keyboard('{ArrowDown}');
    expect(row(/Wise/)).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(row(/Monobank/)).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSend).toHaveBeenCalledWith('f1', [{ questionId: 1, optionId: 1 }], 'Which bank account should the invoice use? — Wise');
  });

  it('a number key picks that option', async () => {
    const { user, onSend } = renderForm(makeForm([bankQ()]));
    row(/Monobank/).focus();
    await user.keyboard('2');
    expect(onSend).toHaveBeenCalledWith('f1', [{ questionId: 1, optionId: 1 }], 'Which bank account should the invoice use? — Wise');
  });
});

describe('Something else and typed answers (AC-38, AC-14)', () => {
  it('Something else turns into an inline input; Enter confirms the typed text', async () => {
    const { user, onSend } = renderForm(makeForm([customerQ()]));
    await user.click(row('Something else'));
    const input = screen.getByRole('textbox', { name: 'Something else' });
    expect(input).toHaveFocus();
    await user.type(input, 'Globex{Enter}');
    expect(onSend).toHaveBeenCalledWith('f1', [{ questionId: 0, text: 'Globex' }], 'Which Customer is this invoice for? — Globex');
  });

  it('an options-only question has no Something else row', () => {
    renderForm(makeForm([bankQ()]));
    expect(screen.queryByRole('radio', { name: /Something else/ })).toBeNull();
  });

  it('rejects a bad price under the input and does not advance; a valid one is accepted', async () => {
    const { user, onSend } = renderForm(makeForm([priceQ()]));
    const input = screen.getByRole('textbox');
    await user.type(input, 'forty{Enter}');
    const message = await screen.findByText('Enter a number greater than 0, with at most 2 decimals.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(message.id);
    expect(onSend).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '40{Enter}');
    expect(onSend).toHaveBeenCalledWith('f1', [{ questionId: 1, text: '40' }], 'What is the hourly rate for web dev? — 40');
  });

  it('input-only question: the input is already active with a plain placeholder, not "Something else"', () => {
    renderForm(makeForm([priceQ()]));
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Type an amount');
    expect(screen.queryByText('Something else')).toBeNull();
  });

  it('the Confirm answer button does what Enter does', async () => {
    const { user, onSend } = renderForm(makeForm([priceQ()]));
    await user.type(screen.getByRole('textbox'), '40');
    await user.click(screen.getByRole('button', { name: 'Confirm answer' }));
    expect(onSend).toHaveBeenCalledWith('f1', [{ questionId: 1, text: '40' }], 'What is the hourly rate for web dev? — 40');
  });

  it('shows the input directly with the match helper for an input-only question', () => {
    renderForm(makeForm([customerQ({ options: [], matchCount: 12 })]));
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('12 match. Type a more exact name.')).toBeInTheDocument();
  });

  it('shows a server 400 field error under the question', () => {
    renderForm(makeForm([priceQ()]), { fieldErrors: { 'form.answers.1': ['Enter a number greater than 0, with at most 2 decimals.'] } });
    const message = screen.getByText('Enter a number greater than 0, with at most 2 decimals.');
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toContain(message.id);
  });
});

describe('close, language, read-only', () => {
  it('× calls onClose and sends nothing', async () => {
    const { user, onClose, onSend } = renderForm(makeForm(three()));
    await user.click(screen.getByRole('button', { name: 'Close questions' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it.each([
    ['sent', { state: 'CHOSEN', answers: [{ questionId: 0, optionId: 0 }] }, true],
    ['closed', { state: 'CLOSED' }, true],
    ['not the latest', {}, false],
  ])('a %s form renders nothing', (_n, over, isLatest) => {
    const { container } = renderForm(makeForm([customerQ()], over), { isLatest });
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('R3 focus management (T82)', () => {
  const inputQ = () => priceQ({ questionId: 1 });

  it('does not steal focus on first mount, even for an input-only question', () => {
    renderForm(makeForm([inputQ()]));
    expect(document.activeElement).toBe(document.body);
  });

  it('after a pick advances to an input-only question, focus moves to its input', async () => {
    const { user } = renderForm(makeForm([bankQ({ questionId: 0 }), inputQ()]));
    await user.click(row(/Wise/));
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('after advancing to an options question, focus moves to its first row', async () => {
    const { user } = renderForm(makeForm(three()));
    await user.click(row(/Acme GmbH/));
    expect(screen.getByText('Which bank account should the invoice use?')).toBeInTheDocument();
    expect(row(/Monobank/)).toHaveFocus();
  });

  it('the question title is announced politely (aria-live)', () => {
    renderForm(makeForm(three()));
    const title = screen.getByText('Which Customer is this invoice for?');
    expect(title).toHaveAttribute('aria-live', 'polite');
  });

  it('keyboard 1-9 still works after advancing', async () => {
    const { user, onSend } = renderForm(makeForm([customerQ(), bankQ()]));
    await user.click(row(/Acme GmbH/));
    await user.keyboard('2');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][1]).toEqual([{ questionId: 0, optionId: 1 }, { questionId: 1, optionId: 1 }]);
  });
});

describe('unit suffix and dock height (T86, AC-55)', () => {
  const unitForm = (q: FormQuestionView, currency: string | null) => makeForm([q], { currency });

  it('shows the invoice currency beside a PRICE input and in its accessible description', () => {
    renderForm(unitForm(priceQ(), 'EUR'));
    const input = screen.getByRole('textbox');
    expect(screen.getByText('EUR')).toBeVisible();
    expect(input).toHaveAccessibleDescription(/EUR/);
  });

  it('shows the currency beside the Something else input of a PRICE question with options', async () => {
    const { user } = renderForm(unitForm(priceQ({ options: [{ optionId: 0, label: '50' }] }), 'EUR'));
    await user.click(screen.getByRole('radio', { name: /Something else/ }));
    expect(screen.getByText('EUR')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(/EUR/);
  });

  it('shows the currency beside a DISCOUNT input (an amount, not a percent)', () => {
    renderForm(unitForm(priceQ({ field: 'DISCOUNT', prompt: 'Discount?', input: 'DISCOUNT' } as Partial<FormQuestionView>), 'EUR'));
    expect(screen.getByText('EUR')).toBeVisible();
    expect(screen.queryByText('%')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(/EUR/);
  });

  it('shows % beside a tax RATE question', () => {
    renderForm(
      unitForm(priceQ({ field: 'TAX_RATE', prompt: 'Tax rate?', input: 'RATE' } as Partial<FormQuestionView>), 'EUR'),
    );
    expect(screen.getByText('%')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(/%/);
  });

  it('caps the scrolling options list at 40dvh, 50dvh from md up', () => {
    const { container } = renderForm(makeForm([bankQ()]));
    const list = container.querySelector('[data-slot="question-form"] .overflow-y-auto') as HTMLElement;
    expect(list).not.toBeNull();
    expect(list.className).toContain('max-h-[40dvh]');
    expect(list.className).toContain('md:max-h-[50dvh]');
  });
});
