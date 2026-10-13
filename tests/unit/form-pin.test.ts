// ai-chat-v2 T53 (spec §1 F6; sad.md §5 revision "Submit order"; AC-10, AC-38, AC-39): sent answers are applied to the
// form's stored draft request by code: picks as exact ids, "Other…" record answers as the Freelancer's words, dates
// (days after the final issue date), values, and skips. Pure; the input is never mutated.
import { describe, expect, it } from 'vitest';
import { pinAnswers, type DraftRequestPartial } from '@/lib/services/assistant-drafts/form-pin';
import { composeForm, dateOptions, type FormQuestionDraft } from '@/lib/services/assistant-drafts/forms';
import type { FormField } from '@/types/assistant/types';

const draft = (field: FormField, lineIndex: number | null, options: FormQuestionDraft['options'] = [], input: FormQuestionDraft['input'] = 'TEXT'): FormQuestionDraft => ({
  field,
  lineIndex,
  prompt: null,
  options,
  input,
  required: true,
  skippable: false,
  matchCount: null,
  source: 'CHAT',
});
const base = (): DraftRequestPartial => ({
  customer: 'Acme',
  senderProfile: 'Main',
  currency: 'USD',
  notes: 'old notes',
  lines: [{ description: 'web dev', quantity: '10' }, { description: 'Code', quantity: '1', price: '100' }],
});
const ctx = { today: '2026-10-13' };

describe('pinAnswers', () => {
  const form = composeForm(
    [],
    [
      draft('CUSTOMER', null, [{ optionId: 0, label: 'Acme Corp (a@x.test)', ref: { customerId: 'c1' } }, { optionId: 1, label: 'Аcme Corp (b@x.test)', ref: { customerId: 'c2' } }]),
      draft('SENDER_PROFILE', null, [{ optionId: 0, label: 'Side', ref: { senderProfileId: 's2' } }]),
      draft('BANK_ACCOUNT', null, [{ optionId: 0, label: 'Mono ••1234 · USD', ref: { bankAccountId: 'b2' } }]),
      draft('CURRENCY', null, [{ optionId: 0, label: 'EUR', ref: { currency: 'EUR' } }]),
      draft('PRODUCT', 1, [{ optionId: 0, label: 'Code pro · hour · 90.00 USD', ref: { productId: 'p9' } }]),
      draft('PRICE', 0, [], 'AMOUNT'),
    ]
  );
  const id = (field: FormField) => form.find((x) => x.field === field)!.questionId;

  it('AC-10: picks pin exact ids, dropping the written names', () => {
    const out = pinAnswers(base(), form, [
      { questionId: id('CUSTOMER'), optionId: 1 },
      { questionId: id('SENDER_PROFILE'), optionId: 0 },
      { questionId: id('BANK_ACCOUNT'), optionId: 0 },
      { questionId: id('CURRENCY'), optionId: 0 },
      { questionId: id('PRODUCT'), optionId: 0 },
      { questionId: id('PRICE'), text: ' 40 ' },
    ], ctx);
    expect(out).toEqual({
      customerId: 'c2',
      senderProfileId: 's2',
      bankAccount: 'b2',
      currency: 'EUR',
      notes: 'old notes',
      lines: [{ description: 'web dev', quantity: '10', price: '40' }, { description: 'Code', quantity: '1', price: '100', productId: 'p9' }],
    });
  });

  it('AC-38: an "Other…" Customer is pinned as the typed name, never an id', () => {
    const out = pinAnswers({ ...base(), customer: undefined, customerId: 'c1' }, form, [{ questionId: id('CUSTOMER'), text: 'Оohn  Doe' }], ctx);
    expect(out.customer).toBe('Оohn  Doe');
    expect(out).not.toHaveProperty('customerId');
  });

  it('"Other…" profile, account, currency and product are the Freelancer\'s words', () => {
    const out = pinAnswers({ ...base(), senderProfileId: 's1', senderProfile: undefined }, form, [
      { questionId: id('SENDER_PROFILE'), text: 'Studio' },
      { questionId: id('BANK_ACCOUNT'), text: 'Wise' },
      { questionId: id('CURRENCY'), text: '€' },
      { questionId: id('PRODUCT'), text: 'Audit' },
    ], ctx);
    expect(out).toMatchObject({ senderProfile: 'Studio', bankAccount: 'Wise', currency: '€' });
    expect(out).not.toHaveProperty('senderProfileId');
    expect(out.lines?.[1]).toEqual({ description: 'Audit', quantity: '1', price: '100' });
  });

  it('AC-39: "Yesterday" then "14 days after the issue date" pins 2026-10-12 and 2026-10-26', () => {
    const dates = composeForm([], [
      { ...draft('ISSUE_DATE', null, dateOptions('ISSUE_DATE', ctx), 'DATE') },
      { ...draft('DUE_DATE', null, dateOptions('DUE_DATE', ctx), 'DATE') },
    ]);
    const out = pinAnswers(base(), dates, [{ questionId: 1, optionId: 1 }, { questionId: 0, optionId: 1 }], { today: '2026-10-15' });
    expect(out).toMatchObject({ issueDate: '2026-10-12', dueDate: '2026-10-26' });
  });

  it('days after the issue date count from the request\'s issue date, else today', () => {
    const due = composeForm([], [draft('DUE_DATE', null, dateOptions('DUE_DATE', ctx), 'DATE')]);
    expect(pinAnswers({ ...base(), issueDate: '2026-10-01' }, due, [{ questionId: 0, optionId: 0 }], ctx).dueDate).toBe('2026-10-08');
    expect(pinAnswers(base(), due, [{ questionId: 0, optionId: 2 }], ctx).dueDate).toBe('2026-11-12');
  });

  it('typed dates and values land in their fields; a skip unsets the field', () => {
    const values = composeForm([], [
      draft('ISSUE_DATE', null, [], 'DATE'),
      draft('DUE_DATE', null, [], 'DATE'),
      draft('QUANTITY', 1, [], 'AMOUNT'),
      { ...draft('TAX_RATE', null, [], 'RATE'), required: false, skippable: true },
      { ...draft('DISCOUNT', null, [], 'DISCOUNT'), required: false, skippable: true },
      { ...draft('NOTES', null), required: false, skippable: true },
    ]);
    const qid = (field: FormField) => values.find((x) => x.field === field)!.questionId;
    const out = pinAnswers(base(), values, [
      { questionId: qid('ISSUE_DATE'), text: '2026-10-01' },
      { questionId: qid('DUE_DATE'), text: '2026-10-31' },
      { questionId: qid('QUANTITY'), text: '3' },
      { questionId: qid('TAX_RATE'), text: '20' },
      { questionId: qid('DISCOUNT'), text: '15.50' },
      { questionId: qid('NOTES'), skipped: true },
    ], ctx);
    expect(out).toMatchObject({ issueDate: '2026-10-01', dueDate: '2026-10-31', taxRate: '20', discount: '15.50' });
    expect(out.lines?.[1].quantity).toBe('3');
    expect(out).not.toHaveProperty('notes');
  });

  it('PO number and payment terms; a free answer changes nothing in the draft', () => {
    const other = composeForm([], [draft('PO_NUMBER', null), draft('PAYMENT_TERMS', null), draft('FREE', null)]);
    const out = pinAnswers(base(), other, [
      { questionId: 0, text: 'PO-77' },
      { questionId: 1, text: 'Net 30' },
      { questionId: 2, text: 'September' },
    ], ctx);
    expect(out).toEqual({ ...base(), poNumber: 'PO-77', paymentTerms: 'Net 30' });
  });

  it('a value for a line the request does not have yet adds that line', () => {
    const price = composeForm([], [draft('PRICE', 0, [], 'AMOUNT')]);
    expect(pinAnswers({ customer: 'Acme' }, price, [{ questionId: 0, text: '40' }], ctx).lines).toEqual([{ description: 'Line 1', price: '40' }]);
  });

  it('never mutates the input', () => {
    const input = base();
    const snapshot = structuredClone(input);
    pinAnswers(input, form, [{ questionId: id('CUSTOMER'), optionId: 0 }, { questionId: id('PRICE'), text: '40' }], ctx);
    expect(input).toEqual(snapshot);
  });

  it('throws on an answer the form does not hold (the form check runs first)', () => {
    expect(() => pinAnswers(base(), form, [{ questionId: 5, optionId: 7 }], ctx)).toThrow();
  });
});
