// ai-chat-v2 T53 (spec §1 F5, F6; screens.md SCR-04 revision "Validation"; AC-38, AC-39): the per-kind format check of
// typed answers (shared by the browser and the server, no server-only) and the composed "question — answer" message.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANSWER_MESSAGES,
  answerFormatError,
  composeAnswerMessage,
  formFormatErrors,
} from '@/lib/validations/form-answers';

const q = (questionId: number, field: string, input: string, prompt: string | null = null) => ({
  questionId,
  field: field as never,
  input: input as never,
  lineIndex: null,
  prompt,
  options: [] as Array<{ optionId: number; label: string }>,
});

describe('answerFormatError: per-kind checks (F6)', () => {
  it.each(['forty', '-5', '0', '0.00', '1.234', '123456789', '', '  ', '1e3', '4,5'])('a price of %j is refused', (text) => {
    expect(answerFormatError({ field: 'PRICE', input: 'AMOUNT' }, text)).toBe(ANSWER_MESSAGES.amount);
  });
  it.each(['40', '40.5', '40.50', '0.01', '12345678.99', ' 40 '])('a price of %j is accepted', (text) => {
    expect(answerFormatError({ field: 'PRICE', input: 'AMOUNT' }, text)).toBeNull();
  });
  it('a quantity follows the same rule', () => {
    expect(answerFormatError({ field: 'QUANTITY', input: 'AMOUNT' }, '0')).toBe('Enter a number greater than 0, with at most 2 decimals.');
    expect(answerFormatError({ field: 'QUANTITY', input: 'AMOUNT' }, '10')).toBeNull();
  });
  it('a tax rate is 0 to 100 with at most 2 decimals', () => {
    for (const ok of ['0', '20', '100', '7.5', '99.99']) expect(answerFormatError({ field: 'TAX_RATE', input: 'RATE' }, ok)).toBeNull();
    for (const bad of ['100.01', '-1', '101', '5.555', 'ten']) {
      expect(answerFormatError({ field: 'TAX_RATE', input: 'RATE' }, bad)).toBe('Enter a rate from 0 to 100.');
    }
  });
  it('a discount is 0 or more with at most 2 decimals', () => {
    for (const ok of ['0', '15', '15.25']) expect(answerFormatError({ field: 'DISCOUNT', input: 'DISCOUNT' }, ok)).toBeNull();
    for (const bad of ['-1', '1.234', 'x']) {
      expect(answerFormatError({ field: 'DISCOUNT', input: 'DISCOUNT' }, bad)).toBe('Enter 0 or more, with at most 2 decimals.');
    }
  });
  it('a date is a real calendar day', () => {
    expect(answerFormatError({ field: 'ISSUE_DATE', input: 'DATE' }, '2026-10-12')).toBeNull();
    for (const bad of ['2026-02-30', '12.10.2026', 'yesterday', '2026-13-01']) {
      expect(answerFormatError({ field: 'ISSUE_DATE', input: 'DATE' }, bad)).toBe('Pick a real day.');
    }
  });
  it.each([
    ['PO_NUMBER', 100],
    ['PAYMENT_TERMS', 200],
    ['NOTES', 2000],
    ['FREE', 500],
    ['CUSTOMER', 200],
    ['SENDER_PROFILE', 200],
    ['BANK_ACCOUNT', 200],
    ['PRODUCT', 200],
    ['CURRENCY', 200],
  ])('%s text is at most %i characters', (field, max) => {
    expect(answerFormatError({ field: field as never, input: 'TEXT' }, 'x'.repeat(max))).toBeNull();
    expect(answerFormatError({ field: field as never, input: 'TEXT' }, 'x'.repeat(max + 1))).toBe(`Keep it under ${max} characters.`);
  });
  it('blank text is not an answer', () => {
    expect(answerFormatError({ field: 'NOTES', input: 'TEXT' }, '   ')).toBe('Enter an answer.');
  });
});

describe('formFormatErrors: every typed answer, plus due-not-before-issue in the same form', () => {
  const questions = [q(0, 'ISSUE_DATE', 'DATE'), q(1, 'DUE_DATE', 'DATE'), q(2, 'PRICE', 'AMOUNT'), q(3, 'CUSTOMER', 'TEXT')];

  it('a due date typed before a typed issue date is refused on the due question', () => {
    expect(formFormatErrors(questions, [{ questionId: 0, text: '2026-10-12' }, { questionId: 1, text: '2026-10-11' }])).toEqual({
      1: "The due date can't be before the issue date.",
    });
    expect(formFormatErrors(questions, [{ questionId: 0, text: '2026-10-12' }, { questionId: 1, text: '2026-10-12' }])).toEqual({});
  });

  it('the issue date may come from a picked option (the server knows its day)', () => {
    const optionDate = (questionId: number, optionId: number) => (questionId === 0 && optionId === 1 ? '2026-10-12' : null);
    expect(formFormatErrors(questions, [{ questionId: 0, optionId: 1 }, { questionId: 1, text: '2026-10-01' }], { optionDate })).toEqual({
      1: "The due date can't be before the issue date.",
    });
  });

  it('collects one message per bad typed answer; picks and skips are not format-checked', () => {
    expect(
      formFormatErrors(questions, [{ questionId: 2, text: 'forty' }, { questionId: 3, text: 'x'.repeat(201) }, { questionId: 0, optionId: 0 }])
    ).toEqual({ 2: 'Enter a number greater than 0, with at most 2 decimals.', 3: 'Keep it under 200 characters.' });
  });
});

describe('composeAnswerMessage (F5): one "question — answer" line per answered question, from stored labels and typed text', () => {
  const questions = [
    { ...q(0, 'CUSTOMER', 'TEXT'), options: [{ optionId: 0, label: 'Acme Corp' }, { optionId: 1, label: 'Acme GmbH' }] },
    { ...q(1, 'PRICE', 'AMOUNT'), lineIndex: 0 as number | null },
    q(2, 'NOTES', 'TEXT', 'Anything to add?'),
    q(3, 'FREE', 'TEXT', 'What period?'),
  ];

  it('AC-08: a picked option reads its stored label', () => {
    expect(composeAnswerMessage(questions, [{ questionId: 0, optionId: 1 }])).toBe('Which Customer is this invoice for? — Acme GmbH');
  });

  it('lines follow the question order, typed text trimmed and on one line, a skip reads "Skipped"', () => {
    expect(
      composeAnswerMessage(questions, [
        { questionId: 2, skipped: true },
        { questionId: 1, text: ' 40 ' },
        { questionId: 0, text: 'Оohn  Doe' },
        { questionId: 3, text: 'the whole\nof September' },
      ])
    ).toBe('Which Customer is this invoice for? — Оohn  Doe\nWhat price for line 1? — 40\nAnything to add? — Skipped\nWhat period? — the whole of September');
  });

  it('throws on an option the question does not hold (the form check runs first)', () => {
    expect(() => composeAnswerMessage(questions, [{ questionId: 0, optionId: 5 }])).toThrow();
  });
});

describe('isomorphic', () => {
  it('lib/validations/form-answers.ts has no server-only import', () => {
    expect(readFileSync('lib/validations/form-answers.ts', 'utf8')).not.toMatch(/server-only/);
  });
});
