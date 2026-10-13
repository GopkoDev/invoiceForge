// ai-chat-v2 T51 (ADR-0011; openapi 0.3.0 StoredFormQuestion, FormAnswer, FormView; AC-08, AC-12b, AC-13): the
// Question form's zod schemas mirror the contract one-to-one, and a pre-revision offer row reads as a one-question
// form (spec §1 F9a) so reopen and export see one shape.
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import {
  FORM_FIELDS,
  FORM_INPUTS,
  formQuestionSchema,
  storedFormQuestionsSchema,
  toFormView,
  type StoredFormQuestion,
} from '@/lib/services/assistant-drafts/forms';
import { offerRowToFormView } from '@/lib/services/assistant-drafts/offers';
import { formHeading } from '@/lib/services/assistant-drafts/form-headings';
import { formAnswersSchema } from '@/lib/validations/assistant-chat';
import { defaultFormQuestions } from '../../../support/factories/choice-offer';

const SPEC = path.resolve(process.cwd(), 'docs/features/ai-chat-v2/contracts/openapi.yaml');
let specPromise: Promise<any> | undefined;
const schemas = async () => ((specPromise ??= SwaggerParser.dereference(SPEC) as Promise<any>), (await specPromise).components.schemas);

const customerQuestion = (): StoredFormQuestion => formQuestionSchema.parse(defaultFormQuestions()[0]);

describe('Question form schemas mirror openapi 0.3.0 (T51)', () => {
  it('FormField and FormInput are the contract enums, member for member', async () => {
    const s = await schemas();
    expect([...FORM_FIELDS]).toEqual(s.FormField.enum);
    expect([...FORM_INPUTS]).toEqual(s.FormInput.enum);
  });

  it('the factory default questions parse (a Customer question with options + Other…, an input-only price)', () => {
    const parsed = storedFormQuestionsSchema.parse(defaultFormQuestions());
    expect(parsed.map((q) => [q.questionId, q.field, q.heading, q.input, q.options.length])).toEqual([
      [0, 'CUSTOMER', 'Customer', 'TEXT', 2],
      [1, 'PRICE', 'Line 1 · Price', 'AMOUNT', 0],
    ]);
  });

  it('accepts date refs and the three due-date offsets, and refuses any other offset or an unknown ref key', () => {
    const q = { ...customerQuestion(), field: 'DUE_DATE', heading: 'Due date', input: 'DATE' as const };
    for (const daysAfterIssue of [7, 14, 30]) {
      expect(formQuestionSchema.safeParse({ ...q, options: [{ optionId: 0, label: '7 days', ref: { daysAfterIssue } }] }).success).toBe(true);
    }
    expect(formQuestionSchema.safeParse({ ...q, options: [{ optionId: 0, label: 'x', ref: { daysAfterIssue: 10 } }] }).success).toBe(false);
    expect(formQuestionSchema.safeParse({ ...q, options: [{ optionId: 0, label: 'Today · 13 Oct 2026', ref: { date: '2026-10-13' } }] }).success).toBe(true);
    expect(formQuestionSchema.safeParse({ ...q, options: [{ optionId: 0, label: 'x', ref: { date: '2026-02-30' } }] }).success).toBe(false);
    expect(formQuestionSchema.safeParse({ ...q, options: [{ optionId: 0, label: 'x', ref: { invoiceId: 'inv1' } }] }).success).toBe(false);
  });

  it.each([
    ['nine options', (q: any) => ({ ...q, options: Array.from({ length: 9 }, (_, i) => ({ optionId: i % 8, label: `C${i}`, ref: { customerId: `c${i}` } })) })],
    ['a prompt over 140 characters', (q: any) => ({ ...q, prompt: 'x'.repeat(141) })],
    ['a heading over 60 characters', (q: any) => ({ ...q, heading: 'x'.repeat(61) })],
    ['questionId 6', (q: any) => ({ ...q, questionId: 6 })],
    ['an unknown field', (q: any) => ({ ...q, field: 'SHIPPING' })],
    ['an unknown input', (q: any) => ({ ...q, input: 'NUMBER' })],
    ['an unknown source', (q: any) => ({ ...q, source: 'MODEL' })],
    ['matchCount 8 (only above 8)', (q: any) => ({ ...q, matchCount: 8 })],
    ['an empty label', (q: any) => ({ ...q, options: [{ optionId: 0, label: '', ref: { customerId: 'c1' } }] })],
    ['an extra key', (q: any) => ({ ...q, label: 'model text' })],
  ])('refuses %s', (_name, mutate) => {
    expect(formQuestionSchema.safeParse(mutate(customerQuestion())).success).toBe(false);
  });

  it('a stored form holds 1..6 questions', () => {
    const one = customerQuestion();
    expect(storedFormQuestionsSchema.safeParse([]).success).toBe(false);
    expect(storedFormQuestionsSchema.safeParse(Array.from({ length: 6 }, (_, i) => ({ ...one, questionId: i }))).success).toBe(true);
    expect(storedFormQuestionsSchema.safeParse(Array.from({ length: 7 }, (_, i) => ({ ...one, questionId: i % 6 }))).success).toBe(false);
  });

  it('answers: an option pick, a typed text or a skip; 1..6 of them, at most one per question', () => {
    expect(formAnswersSchema.safeParse([{ questionId: 0, optionId: 1 }, { questionId: 1, text: '40' }, { questionId: 2, skipped: true }]).success).toBe(true);
    expect(formAnswersSchema.safeParse([]).success).toBe(false);
    expect(formAnswersSchema.safeParse([{ questionId: 0, optionId: 1 }, { questionId: 0, text: 'Acme' }]).success).toBe(false);
    expect(formAnswersSchema.safeParse([{ questionId: 0, skipped: false }]).success).toBe(false);
    expect(formAnswersSchema.safeParse([{ questionId: 0, optionId: 1, text: 'x' }]).success).toBe(false);
    expect(formAnswersSchema.safeParse([{ questionId: 0, text: '' }]).success).toBe(false);
    expect(formAnswersSchema.safeParse([{ questionId: 0, text: 'x'.repeat(2001) }]).success).toBe(false);
    expect(formAnswersSchema.safeParse([{ questionId: 6, optionId: 0 }]).success).toBe(false);
    expect(formAnswersSchema.safeParse([{ questionId: 0, optionId: 8 }]).success).toBe(false);
  });

  it('headings are app text per field ("Customer", "Line 1 · Price", "Issue date", …)', () => {
    expect(formHeading('CUSTOMER', null)).toBe('Customer');
    expect(formHeading('SENDER_PROFILE', null)).toBe('Sender profile');
    expect(formHeading('BANK_ACCOUNT', null)).toBe('Bank account');
    expect(formHeading('CURRENCY', null)).toBe('Currency');
    expect(formHeading('PRODUCT', 0)).toBe('Line 1 · Product');
    expect(formHeading('QUANTITY', 2)).toBe('Line 3 · Quantity');
    expect(formHeading('PRICE', 0)).toBe('Line 1 · Price');
    expect(formHeading('ISSUE_DATE', null)).toBe('Issue date');
    expect(formHeading('DUE_DATE', null)).toBe('Due date');
    expect(formHeading('TAX_RATE', null)).toBe('Tax rate');
    expect(formHeading('DISCOUNT', null)).toBe('Discount');
    expect(formHeading('PO_NUMBER', null)).toBe('PO number');
    expect(formHeading('PAYMENT_TERMS', null)).toBe('Payment terms');
    expect(formHeading('NOTES', null)).toBe('Notes');
    expect(formHeading('FREE', null)).toBe('Question');
  });
});

describe('FormView: what the browser gets (no refs, no stored request)', () => {
  const formRow = (over: Record<string, unknown> = {}) => ({
    id: 'form1',
    kind: 'FORM' as const,
    state: 'OPEN' as const,
    lineIndex: null,
    options: [],
    chosenOptionId: null,
    questions: defaultFormQuestions(),
    answers: null,
    ...over,
  });

  it('a FORM row maps to labels only, and its answers once CHOSEN', () => {
    const view = toFormView(formRow({ state: 'CHOSEN', answers: [{ questionId: 0, optionId: 1 }, { questionId: 1, text: '40' }] }));
    expect(view).toEqual({
      formId: 'form1',
      state: 'CHOSEN',
      questions: [
        { questionId: 0, field: 'CUSTOMER', lineIndex: null, heading: 'Customer', prompt: 'Which Acme do you mean?', options: [{ optionId: 0, label: 'Acme Corp' }, { optionId: 1, label: 'Acme GmbH' }], input: 'TEXT', required: true, skippable: false, matchCount: null },
        { questionId: 1, field: 'PRICE', lineIndex: 0, heading: 'Line 1 · Price', prompt: 'What is the hourly price?', options: [], input: 'AMOUNT', required: true, skippable: false, matchCount: null },
      ],
      answers: [{ questionId: 0, optionId: 1 }, { questionId: 1, text: '40' }],
    });
    expect(JSON.stringify(view)).not.toMatch(/customerId|fixture-acme|source/);
  });

  it('an OPEN or CLOSED form shows no answers', () => {
    expect(toFormView(formRow()).answers).toBeNull();
    expect(toFormView(formRow({ state: 'CLOSED', answers: [{ questionId: 0, optionId: 1 }] })).answers).toBeNull();
  });

  describe('legacy offers (F9a) read as one-question forms', () => {
    const legacyOptions = [
      { optionId: 0, label: 'Acme Corp (billing@acme.example.test)', ref: { customerId: 'c1' } },
      { optionId: 1, label: 'Acme GmbH (no email)', ref: { customerId: 'c2' } },
    ];
    const backfilled = (kind: string, lineIndex: number | null, options = legacyOptions) => [
      { questionId: 0, field: kind, lineIndex, prompt: null, options, input: 'NONE', required: true, skippable: false, matchCount: null, source: 'RESOLVER' },
    ];
    const legacyRow = (over: Record<string, unknown> = {}) => ({
      id: 'off1',
      kind: 'CUSTOMER' as const,
      state: 'CHOSEN' as const,
      lineIndex: null,
      options: legacyOptions,
      chosenOptionId: 1,
      questions: backfilled('CUSTOMER', null),
      answers: [{ questionId: 0, optionId: 1 }],
      ...over,
    });

    it('a pressed (CHOSEN) backfilled offer shows its question with the app heading and its answer', () => {
      expect(offerRowToFormView(legacyRow())).toEqual({
        formId: 'off1',
        state: 'CHOSEN',
        questions: [
          { questionId: 0, field: 'CUSTOMER', lineIndex: null, heading: 'Customer', prompt: null, options: [{ optionId: 0, label: 'Acme Corp (billing@acme.example.test)' }, { optionId: 1, label: 'Acme GmbH (no email)' }], input: 'NONE', required: true, skippable: false, matchCount: null },
        ],
        answers: [{ questionId: 0, optionId: 1 }],
      });
      expect(toFormView(legacyRow())).toEqual(offerRowToFormView(legacyRow()));
    });

    it('a product offer reads "Line N · Product"; an unpressed OPEN one has no answers and stays answerable', () => {
      const view = offerRowToFormView(
        legacyRow({ kind: 'PRODUCT', lineIndex: 1, state: 'OPEN', chosenOptionId: null, answers: null, questions: backfilled('PRODUCT', 1) })
      );
      expect(view.state).toBe('OPEN');
      expect(view.questions[0]).toMatchObject({ field: 'PRODUCT', lineIndex: 1, heading: 'Line 2 · Product', input: 'NONE' });
      expect(view.answers).toBeNull();
    });

    it('a row not yet backfilled (questions NULL) reads the same from kind, options and chosenOptionId', () => {
      expect(offerRowToFormView(legacyRow({ questions: null, answers: null }))).toEqual(offerRowToFormView(legacyRow()));
    });
  });
});
