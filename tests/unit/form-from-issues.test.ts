// ai-chat-v2 T52 (ADR-0011 "Sources of questions", "One form per reply"; spec §1 F1–F4; AC-08, AC-08b, AC-14, AC-39,
// AC-41). Rewritten from the T10 offerFromIssues suite (ADR-0002, superseded): every case it held is kept and asserted
// on the question instead of the single offer; "one choice per reply" became "every issue in one form, in the F1
// order". Labels, refs and the 0-based optionIds are unchanged (bank "<bank> ••<last four> · <currency>", product
// "<name> · <unit> · <price> <currency>", look-alike Customers with their email or "no email").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  composeForm,
  dateOptions,
  fallbackQuestions,
  formFromIssues,
  formQuestionSchema,
  type FormQuestionDraft,
} from '@/lib/services/assistant-drafts/forms';
import { todayInZone } from '@/lib/helpers/calendar-day';
import { storedOfferOptionSchema } from '@/lib/services/assistant-drafts/offers';
import type { DraftIssue } from '@/lib/services/assistant-drafts/schema';
import { LOOK_ALIKE_PAIRS } from '../support/fixtures/look-alike-names';

const cust = (id: string, name: string, email: string | null = `${id}@x.test`) => ({
  customerId: id,
  name: { freelancerText: name },
  email,
});
const ambiguous = (candidates: ReturnType<typeof cust>[]): DraftIssue => ({
  kind: 'CUSTOMER_AMBIGUOUS',
  written: 'Acme',
  candidates,
});
const account = (id: string, bank: string, last: string, currency: 'USD' | 'EUR' = 'USD') => ({
  bankAccountId: id,
  label: `${bank} ${last}`,
  bankName: { freelancerText: bank },
  lastFour: last,
  currency,
});
const severalAccounts = (accounts = [account('b1', 'Mono', '1234'), account('b2', 'Privat', '5678')]): DraftIssue => ({
  kind: 'SEVERAL_ACCOUNTS_IN_CURRENCY',
  currency: 'USD',
  accounts,
});
const productIssue = (lineIndex = 1): DraftIssue => ({
  kind: 'PRODUCT_AMBIGUOUS',
  lineIndex,
  written: 'Design',
  candidates: [
    { productId: 'p1', name: { freelancerText: 'Design' }, unit: 'hour', price: '50.00', currency: 'USD' },
    { productId: 'p2', name: { freelancerText: 'Design pro' }, unit: 'day', price: '400.00', currency: 'USD' },
  ],
});
const ctx = { invoiceCurrency: 'USD' as const, today: '2026-10-13', timeZone: 'Europe/Kyiv' };
const manyCustomers = (n: number) => ambiguous(Array.from({ length: n }, (_, i) => cust(`c${i}`, `Studio ${i}`)));
const only = (issues: DraftIssue[]) => {
  const qs = formFromIssues(issues, ctx);
  expect(qs).toHaveLength(1);
  return qs[0];
};
const fieldsOf = (qs: { field: string; lineIndex: number | null }[]) => qs.map((q) => (q.lineIndex === null ? q.field : `${q.field}#${q.lineIndex}`));

describe('formFromIssues: every resolver issue becomes a question (T52)', () => {
  describe('AC-08 two Customers', () => {
    it('a Customer question with the saved names in candidate order, Other… (TEXT), required', () => {
      expect(only([ambiguous([cust('c1', 'Acme Corp'), cust('c2', 'Acme GmbH')])])).toEqual({
        field: 'CUSTOMER',
        lineIndex: null,
        prompt: null,
        options: [
          { optionId: 0, label: 'Acme Corp', ref: { customerId: 'c1' } },
          { optionId: 1, label: 'Acme GmbH', ref: { customerId: 'c2' } },
        ],
        input: 'TEXT',
        required: true,
        skippable: false,
        matchCount: null,
        source: 'RESOLVER',
      });
    });

    it('a near-miss with one candidate is a Customer question with one option', () => {
      const q = only([{ kind: 'CUSTOMER_NEAR_MISS', written: 'Acm', candidates: [cust('c1', 'Acme Corp')] }]);
      expect(q.field).toBe('CUSTOMER');
      expect(q.options).toHaveLength(1);
    });

    it('a Customer not found is an input-only Customer question', () => {
      expect(only([{ kind: 'CUSTOMER_NOT_FOUND', written: 'Zeta' }])).toMatchObject({ field: 'CUSTOMER', options: [], input: 'TEXT', required: true });
    });
  });

  describe('AC-08b every issue in one form, in the F1 order', () => {
    it('Customer and bank issues together give both questions, Customer first', () => {
      const qs = composeForm(formFromIssues([severalAccounts(), ambiguous([cust('c1', 'Acme Corp'), cust('c2', 'Acme GmbH')])], ctx), []);
      expect(fieldsOf(qs)).toEqual(['CUSTOMER', 'BANK_ACCOUNT']);
      expect(qs.map((q) => q.questionId)).toEqual([0, 1]);
      expect(qs[1].options.map((o) => o.label)).toEqual(['Mono ••1234 · USD', 'Privat ••5678 · USD']);
    });

    it('bank-only issues ask for the account with the server labels', () => {
      expect(only([severalAccounts()]).options).toEqual([
        { optionId: 0, label: 'Mono ••1234 · USD', ref: { bankAccountId: 'b1' } },
        { optionId: 1, label: 'Privat ••5678 · USD', ref: { bankAccountId: 'b2' } },
      ]);
    });

    it('order Customer > sender profile > bank account > currency > product', () => {
      const profile: DraftIssue = {
        kind: 'SENDER_PROFILE_NOT_FOUND',
        written: 'Ltd',
        options: [],
        profiles: [{ senderProfileId: 's1', name: { freelancerText: 'Main' } }],
      };
      const currencyIssue: DraftIssue = { kind: 'CURRENCY_UNCLEAR', written: '$', options: ['USD', 'UAH'] };
      const customer = ambiguous([cust('c1', 'Acme Corp'), cust('c2', 'Acme GmbH')]);
      const qs = composeForm(formFromIssues([productIssue(), severalAccounts(), currencyIssue, profile, customer], ctx), []);
      expect(fieldsOf(qs)).toEqual(['CUSTOMER', 'SENDER_PROFILE', 'BANK_ACCOUNT', 'CURRENCY', 'PRODUCT#1']);
    });

    it('a FIELD_INVALID issue becomes its field\'s question with the resolver message as the prompt', () => {
      const qs = formFromIssues([{ kind: 'FIELD_INVALID', field: 'taxRate', message: 'Tax rate must be 100 or less.' }, severalAccounts()], ctx);
      expect(fieldsOf(qs)).toEqual(['TAX_RATE', 'BANK_ACCOUNT']);
      expect(qs[0]).toMatchObject({ prompt: 'Tax rate must be 100 or less.', input: 'RATE', required: false, skippable: true, options: [] });
    });
  });

  describe('AC-09 the question depends only on the issue', () => {
    it('the same issue gives deep-equal questions and the function takes no text', () => {
      const issue = severalAccounts();
      expect(formFromIssues([structuredClone(issue)], ctx)).toEqual(formFromIssues([issue], ctx));
      expect(formFromIssues.length).toBeLessThanOrEqual(2);
    });

    it('never offers an account the issue did not carry', () => {
      expect(only([severalAccounts()]).options.map((o) => o.ref)).toEqual([{ bankAccountId: 'b1' }, { bankAccountId: 'b2' }]);
    });
  });

  describe('AC-10 look-alike Customers', () => {
    const [stored, written] = LOOK_ALIKE_PAIRS[0]; // 'Аcme Corp' (Cyrillic А) vs 'Acme Corp'
    it('adds the email to each option when two folded names are equal', () => {
      const q = only([ambiguous([cust('c1', written, 'a@x.test'), cust('c2', stored, 'b@x.test')])]);
      expect(q.options.map((o) => o.label)).toEqual([`${written} (a@x.test)`, `${stored} (b@x.test)`]);
      expect(q.options[1].ref).toEqual({ customerId: 'c2' });
    });

    it('shows "no email" for a look-alike Customer without one', () => {
      expect(only([ambiguous([cust('c1', written, 'a@x.test'), cust('c2', stored, null)])]).options[1].label).toBe(`${stored} (no email)`);
    });

    it('case-only duplicates also count as look-alikes', () => {
      const q = only([ambiguous([cust('c1', 'Acme Corp', 'a@x.test'), cust('c2', 'ACME  CORP', null)])]);
      expect(q.options.map((o) => o.label)).toEqual(['Acme Corp (a@x.test)', 'ACME  CORP (no email)']);
    });

    it('distinct names carry no suffix, only the look-alike ones do', () => {
      const q = only([ambiguous([cust('c1', 'Acme GmbH'), cust('c2', 'Acme Corp', 'a@x.test'), cust('c3', stored, null)])]);
      expect(q.options.map((o) => o.label)).toEqual(['Acme GmbH', 'Acme Corp (a@x.test)', `${stored} (no email)`]);
    });
  });

  describe('AC-14 more than 8 matches: input only with the count', () => {
    it('12 matching Customers: no options, matchCount 12, input TEXT', () => {
      expect(only([manyCustomers(12)])).toMatchObject({ field: 'CUSTOMER', options: [], matchCount: 12, input: 'TEXT', required: true });
    });
    it('8 options: a question of 8 with optionIds 0..7 and no count', () => {
      const q = only([manyCustomers(8)]);
      expect(q.options.map((o) => o.optionId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(q.matchCount).toBeNull();
    });
    it('9 options: input only, matchCount 9', () => {
      expect(only([manyCustomers(9)])).toMatchObject({ options: [], matchCount: 9 });
    });
    // Review 2026-10-13 R12-2: product candidates are capped at 50; the count is the real number of matches.
    it('60 matching products (50 listed, total 60): input only, matchCount 60', () => {
      const products = Array.from({ length: 50 }, (_, i) => ({
        productId: `p${i}`,
        name: { freelancerText: `Audit ${i}` },
        unit: 'h',
        price: '1.00',
        currency: 'USD' as const,
      }));
      const issue = { kind: 'PRODUCT_AMBIGUOUS', lineIndex: 0, written: 'audit', candidates: products, total: 60 } as DraftIssue;
      expect(only([issue])).toMatchObject({ field: 'PRODUCT', lineIndex: 0, options: [], matchCount: 60, input: 'TEXT' });
    });
  });

  describe('other kinds', () => {
    it('SENDER_PROFILE_NOT_FOUND offers the profiles by name', () => {
      const q = only([
        {
          kind: 'SENDER_PROFILE_NOT_FOUND',
          written: 'x',
          options: [],
          profiles: [
            { senderProfileId: 's1', name: { freelancerText: 'Main' } },
            { senderProfileId: 's2', name: { freelancerText: 'Side' } },
          ],
        },
      ]);
      expect(q).toMatchObject({ field: 'SENDER_PROFILE', input: 'TEXT' });
      expect(q.options).toEqual([
        { optionId: 0, label: 'Main', ref: { senderProfileId: 's1' } },
        { optionId: 1, label: 'Side', ref: { senderProfileId: 's2' } },
      ]);
    });

    it('DEFAULT_PROFILE_WITHOUT_ACCOUNT offers otherProfiles', () => {
      const q = only([
        { kind: 'DEFAULT_PROFILE_WITHOUT_ACCOUNT', defaultSenderProfileId: 's0', otherProfiles: [{ senderProfileId: 's1', name: { freelancerText: 'Main' } }] },
      ]);
      expect(q.field).toBe('SENDER_PROFILE');
    });

    it('NO_ACCOUNT_IN_CURRENCY with one other profile is a sender-profile question of one option', () => {
      const q = only([
        { kind: 'NO_ACCOUNT_IN_CURRENCY', currency: 'EUR', senderProfileId: 's0', accounts: [], otherProfiles: [{ senderProfileId: 's1', name: { freelancerText: 'Euro' } }] },
      ]);
      expect(q.field).toBe('SENDER_PROFILE');
      expect(q.options).toHaveLength(1);
    });

    it('NO_ACCOUNT_IN_CURRENCY with no other profile asks for one of the profile\'s own currencies', () => {
      const q = only([
        {
          kind: 'NO_ACCOUNT_IN_CURRENCY',
          currency: 'EUR',
          senderProfileId: 's0',
          accounts: [
            { bankAccountId: 'b1', label: 'Mono 1234', currency: 'USD' },
            { bankAccountId: 'b2', label: 'Privat 5678', currency: 'UAH' },
            { bankAccountId: 'b3', label: 'Wise 9999', currency: 'USD' },
          ],
          otherProfiles: [],
        },
      ]);
      expect(q).toMatchObject({ field: 'CURRENCY', input: 'TEXT' });
      expect(q.options).toEqual([
        { optionId: 0, label: 'USD', ref: { currency: 'USD' } },
        { optionId: 1, label: 'UAH', ref: { currency: 'UAH' } },
      ]);
    });

    it('NO_ACCOUNT_IN_CURRENCY with neither is no question', () => {
      expect(formFromIssues([{ kind: 'NO_ACCOUNT_IN_CURRENCY', currency: 'EUR', senderProfileId: 's0', accounts: [], otherProfiles: [] }], ctx)).toEqual([]);
    });

    it('CURRENCY_UNCLEAR offers only the Currency codes the resolver found', () => {
      expect(only([{ kind: 'CURRENCY_UNCLEAR', written: '$', options: ['USD', 'CAD', 'UAH', 'dollar'] }]).options).toEqual([
        { optionId: 0, label: 'USD', ref: { currency: 'USD' } },
        { optionId: 1, label: 'UAH', ref: { currency: 'UAH' } },
      ]);
    });

    it('BANK_ACCOUNT_NOT_FOUND and BANK_ACCOUNT_AMBIGUOUS offer the accounts', () => {
      const accounts = [account('b1', 'Mono', '1234')];
      for (const kind of ['BANK_ACCOUNT_NOT_FOUND', 'BANK_ACCOUNT_AMBIGUOUS'] as const) {
        expect(only([{ kind, written: 'x', accounts }])).toMatchObject({ field: 'BANK_ACCOUNT', options: [{ optionId: 0, label: 'Mono ••1234 · USD' }] });
      }
    });

    it('BANK_ACCOUNT_CURRENCY_MISMATCH offers the profile\'s accounts in the draft currency; input only when none', () => {
      const mismatch = (accounts?: ReturnType<typeof account>[]): DraftIssue => ({
        kind: 'BANK_ACCOUNT_CURRENCY_MISMATCH',
        written: 'Mono',
        currency: 'USD',
        senderProfileId: 's',
        account: { bankAccountId: 'b9', label: 'Mono 1111', currency: 'EUR' },
        ...(accounts ? { accounts } : {}),
      });
      expect(only([mismatch([account('b1', 'Privat', '5678')])])).toMatchObject({
        field: 'BANK_ACCOUNT',
        options: [{ optionId: 0, label: 'Privat ••5678 · USD', ref: { bankAccountId: 'b1' } }],
      });
      expect(only([mismatch([])])).toMatchObject({ field: 'BANK_ACCOUNT', options: [], input: 'TEXT' });
      expect(only([mismatch()])).toMatchObject({ field: 'BANK_ACCOUNT', options: [], input: 'TEXT' });
    });

    it('PRODUCT_AMBIGUOUS offers products with the line index and the price in the invoice currency', () => {
      expect(only([productIssue(2)])).toMatchObject({
        field: 'PRODUCT',
        lineIndex: 2,
        options: [
          { optionId: 0, label: 'Design · hour · 50.00 USD', ref: { productId: 'p1' } },
          { optionId: 1, label: 'Design pro · day · 400.00 USD', ref: { productId: 'p2' } },
        ],
      });
    });

    it('value issues are input-only questions for their line', () => {
      expect(only([{ kind: 'LINE_AMOUNT_MISSING', lineIndex: 0, description: 'web dev' }])).toMatchObject({ field: 'PRICE', lineIndex: 0, options: [], input: 'AMOUNT', required: true });
      expect(only([{ kind: 'LINE_QUANTITY_MISSING', lineIndex: 1, description: 'x' }])).toMatchObject({ field: 'QUANTITY', lineIndex: 1, input: 'AMOUNT' });
      expect(only([{ kind: 'LINE_PRICE_MISSING_IN_CURRENCY', lineIndex: 0, currency: 'USD', products: [] }])).toMatchObject({ field: 'PRICE', lineIndex: 0, input: 'AMOUNT' });
      expect(only([{ kind: 'PRODUCT_NOT_FOUND', lineIndex: 0, written: 'p-x' }])).toMatchObject({ field: 'PRODUCT', lineIndex: 0, options: [], input: 'TEXT' });
    });

    it('FIELD_INVALID maps the editor fields; dates get their computed options', () => {
      const of = (field: string) => formFromIssues([{ kind: 'FIELD_INVALID', field, message: 'm' }], ctx);
      expect(fieldsOf(of('lines.1.quantity'))).toEqual(['QUANTITY#1']);
      expect(fieldsOf(of('lines.0.price'))).toEqual(['PRICE#0']);
      expect(of('discount')[0]).toMatchObject({ field: 'DISCOUNT', input: 'DISCOUNT', skippable: true });
      expect(of('poNumber')[0]).toMatchObject({ field: 'PO_NUMBER', input: 'TEXT', skippable: true });
      expect(of('dueDate')[0]).toMatchObject({ field: 'DUE_DATE', input: 'DATE', required: true });
      expect(of('dueDate')[0].options.map((o) => o.ref)).toEqual([{ daysAfterIssue: 7 }, { daysAfterIssue: 14 }, { daysAfterIssue: 30 }]);
      expect(of('shipping')).toEqual([]);
    });

    it('an empty issue list is no question', () => {
      expect(formFromIssues([], ctx)).toEqual([]);
    });

    it('NO_SENDER_PROFILE_WITH_ACCOUNT is no question (the Freelancer is sent elsewhere)', () => {
      expect(formFromIssues([{ kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' }], ctx)).toEqual([]);
    });
  });
});

describe('dateOptions (AC-39)', () => {
  it('issue date: Today and Yesterday as absolute days in the Freelancer time zone, labelled with the day', () => {
    // 2026-10-12 22:30 UTC is already 2026-10-13 in Kyiv (UTC+3).
    const today = todayInZone('Europe/Kyiv', new Date('2026-10-12T22:30:00Z'));
    expect(today).toBe('2026-10-13');
    expect(dateOptions('ISSUE_DATE', { today })).toEqual([
      { optionId: 0, label: 'Today · 13 Oct 2026', ref: { date: '2026-10-13' } },
      { optionId: 1, label: 'Yesterday · 12 Oct 2026', ref: { date: '2026-10-12' } },
    ]);
  });

  it('due date: 7 / 14 / 30 days after the issue date; the resulting day only when the issue date is fixed', () => {
    expect(dateOptions('DUE_DATE', { today: '2026-10-13' })).toEqual([
      { optionId: 0, label: '7 days after the issue date', ref: { daysAfterIssue: 7 } },
      { optionId: 1, label: '14 days after the issue date', ref: { daysAfterIssue: 14 } },
      { optionId: 2, label: '30 days after the issue date', ref: { daysAfterIssue: 30 } },
    ]);
    expect(dateOptions('DUE_DATE', { today: '2026-10-13', issueDate: '2026-10-12' }).map((o) => o.label)).toEqual([
      '7 days after the issue date · 19 Oct 2026',
      '14 days after the issue date · 26 Oct 2026',
      '30 days after the issue date · 11 Nov 2026',
    ]);
  });
});

describe('composeForm (AC-41, F1)', () => {
  const q = (field: FormQuestionDraft['field'], lineIndex: number | null = null, over: Partial<FormQuestionDraft> = {}): FormQuestionDraft => ({
    field,
    lineIndex,
    prompt: `chat asks ${field}`,
    options: [],
    input: 'TEXT',
    required: true,
    skippable: false,
    matchCount: null,
    source: 'CHAT',
    ...over,
  });

  it('9 open questions keep the first 6 in the F1 order, numbered 0..5, with app headings', () => {
    const chat = [q('FREE'), q('NOTES'), q('PRICE', 0), q('QUANTITY', 0), q('DUE_DATE'), q('ISSUE_DATE'), q('PRODUCT', 0), q('CURRENCY'), q('CUSTOMER')];
    const form = composeForm([], chat);
    expect(form.map((x) => [x.questionId, x.field, x.heading])).toEqual([
      [0, 'CUSTOMER', 'Customer'],
      [1, 'CURRENCY', 'Currency'],
      [2, 'PRODUCT', 'Line 1 · Product'],
      [3, 'ISSUE_DATE', 'Issue date'],
      [4, 'DUE_DATE', 'Due date'],
      [5, 'QUANTITY', 'Line 1 · Quantity'],
    ]);
    for (const x of form) expect(formQuestionSchema.safeParse(x).success).toBe(true);
  });

  it('quantities and prices go by line, quantity before price', () => {
    const form = composeForm([], [q('PRICE', 1), q('PRICE', 0), q('QUANTITY', 1)]);
    expect(fieldsOf(form)).toEqual(['PRICE#0', 'QUANTITY#1', 'PRICE#1']);
  });

  it('the resolver question wins over a chat question for the same field and line (keeping the chat prompt)', () => {
    const resolver = formFromIssues([ambiguous([cust('c1', 'Acme Corp'), cust('c2', 'Acme GmbH')])], ctx);
    const form = composeForm(resolver, [q('CUSTOMER', null, { prompt: 'Which Customer?', options: [{ optionId: 0, label: 'Other Co', ref: { customerId: 'c9' } }] }), q('PRICE', 0)]);
    expect(fieldsOf(form)).toEqual(['CUSTOMER', 'PRICE#0']);
    expect(form[0]).toMatchObject({ source: 'RESOLVER', prompt: 'Which Customer?' });
    expect(form[0].options.map((o) => o.label)).toEqual(['Acme Corp', 'Acme GmbH']);
  });

  it('free questions are never merged', () => {
    expect(fieldsOf(composeForm([], [q('FREE'), q('FREE')]))).toEqual(['FREE', 'FREE']);
  });

  it('no question is no form', () => {
    expect(composeForm([], [])).toEqual([]);
  });

  it('the fallback form asks the same fields as inputs only (no options), source FALLBACK', () => {
    const asked = fallbackQuestions([
      { field: 'CUSTOMER', prompt: 'Which Customer?' },
      { field: 'ISSUE_DATE', prompt: 'Which date?' },
      { field: 'NOTES', prompt: 'Any notes?', optional: true },
    ]);
    const form = composeForm([], asked);
    expect(form.map((x) => [x.field, x.input, x.options.length, x.source, x.required, x.skippable])).toEqual([
      ['CUSTOMER', 'TEXT', 0, 'FALLBACK', true, false],
      ['ISSUE_DATE', 'DATE', 0, 'FALLBACK', true, false],
      ['NOTES', 'TEXT', 0, 'FALLBACK', false, true],
    ]);
  });
});

// Kept from the T10 suite: the legacy option shape still backs pre-revision rows (F9a) and the record refs of forms.
describe('storedOfferOptionSchema', () => {
  it('accepts { optionId, label, ref } with a one-key ref', () => {
    expect(storedOfferOptionSchema.safeParse({ optionId: 0, label: 'Acme', ref: { customerId: 'c1' } }).success).toBe(true);
    expect(storedOfferOptionSchema.safeParse({ optionId: 3, label: 'USD', ref: { currency: 'USD' } }).success).toBe(true);
  });
  it('rejects an empty label, an out-of-range optionId, a missing ref and extra keys', () => {
    expect(storedOfferOptionSchema.safeParse({ optionId: 0, label: '', ref: { customerId: 'c1' } }).success).toBe(false);
    expect(storedOfferOptionSchema.safeParse({ optionId: 8, label: 'a', ref: { customerId: 'c1' } }).success).toBe(false);
    expect(storedOfferOptionSchema.safeParse({ optionId: 0, label: 'a' }).success).toBe(false);
    expect(storedOfferOptionSchema.safeParse({ optionId: 0, label: 'a', ref: { customerId: 'c1' }, extra: 1 }).success).toBe(false);
  });
});

describe('no model path', () => {
  it.each(['offers.ts', 'form-pin.ts', 'forms.ts'])('%s imports no AI SDK or model code', (file) => {
    const src = readFileSync(`lib/services/assistant-drafts/${file}`, 'utf8');
    expect(src).not.toMatch(/from\s+['"](@mastra|ai|@ai-sdk)[/'"]/);
    expect(src).not.toMatch(/from\s+['"]@\/lib\/ai/);
  });
});
