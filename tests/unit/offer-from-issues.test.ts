// ai-chat-v2 T10 (ADR-0002, sad.md §5, openapi OfferOptionLabel): Offered choices are built in code from the
// resolver's typed issues; the model has no input. Contract wins over the task text: refs are one-key objects,
// optionId is 0-based, bank label "<bank> ••<last four> · <currency>", product "<name> · <unit> · <price> <currency>".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offerFromIssues, storedOfferOptionSchema } from '@/lib/services/assistant-drafts/offers';
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
const ctx = { invoiceCurrency: 'USD' as const };
const manyCustomers = (n: number) =>
  ambiguous(Array.from({ length: n }, (_, i) => cust(`c${i}`, `Studio ${i}`)));

describe('offerFromIssues', () => {
  describe('AC-08 two Customers', () => {
    it('offers the Customers in candidate order with their saved names', () => {
      const r = offerFromIssues([ambiguous([cust('c1', 'Acme Corp'), cust('c2', 'Acme GmbH')])], ctx);
      expect(r).toEqual({
        kind: 'OFFER',
        offerKind: 'CUSTOMER',
        lineIndex: null,
        options: [
          { optionId: 0, label: 'Acme Corp', ref: { customerId: 'c1' } },
          { optionId: 1, label: 'Acme GmbH', ref: { customerId: 'c2' } },
        ],
      });
    });

    it('a near-miss with one candidate is an offer of one button', () => {
      const r = offerFromIssues(
        [{ kind: 'CUSTOMER_NEAR_MISS', written: 'Acm', candidates: [cust('c1', 'Acme Corp')] }],
        ctx
      );
      expect(r).toMatchObject({ kind: 'OFFER', offerKind: 'CUSTOMER' });
      if (r.kind === 'OFFER') expect(r.options).toHaveLength(1);
    });
  });

  describe('AC-08b one choice per reply, in resolve order', () => {
    it('Customer and bank issues together offer the Customer only', () => {
      const r = offerFromIssues([severalAccounts(), ambiguous([cust('c1', 'Acme Corp'), cust('c2', 'Acme GmbH')])], ctx);
      expect(r).toMatchObject({ kind: 'OFFER', offerKind: 'CUSTOMER' });
    });

    it('bank-only issues offer the accounts', () => {
      const r = offerFromIssues([severalAccounts()], ctx);
      expect(r).toEqual({
        kind: 'OFFER',
        offerKind: 'BANK_ACCOUNT',
        lineIndex: null,
        options: [
          { optionId: 0, label: 'Mono ••1234 · USD', ref: { bankAccountId: 'b1' } },
          { optionId: 1, label: 'Privat ••5678 · USD', ref: { bankAccountId: 'b2' } },
        ],
      });
    });

    it('precedence Customer > sender profile > currency > bank account > product', () => {
      const profile: DraftIssue = {
        kind: 'SENDER_PROFILE_NOT_FOUND',
        written: 'Ltd',
        options: [],
        profiles: [{ senderProfileId: 's1', name: { freelancerText: 'Main' } }],
      };
      const currencyIssue: DraftIssue = { kind: 'CURRENCY_UNCLEAR', written: '$', options: ['USD', 'UAH'] };
      const bank = severalAccounts();
      const product = productIssue();
      const kindOf = (issues: DraftIssue[]) => {
        const r = offerFromIssues(issues, ctx);
        return r.kind === 'OFFER' ? r.offerKind : r.kind;
      };
      expect(kindOf([product, bank, currencyIssue, profile])).toBe('SENDER_PROFILE');
      expect(kindOf([product, bank, currencyIssue])).toBe('CURRENCY');
      expect(kindOf([product, bank])).toBe('BANK_ACCOUNT');
      expect(kindOf([product])).toBe('PRODUCT');
    });

    it('skips a non-offer issue and offers the next offer-able one', () => {
      const r = offerFromIssues([{ kind: 'FIELD_INVALID', field: 'taxRate', message: 'bad' }, severalAccounts()], ctx);
      expect(r).toMatchObject({ kind: 'OFFER', offerKind: 'BANK_ACCOUNT' });
    });
  });

  describe('AC-09 the offer depends only on the issue', () => {
    it('the same issue gives deep-equal options on every call and the function takes no text', () => {
      const issue = severalAccounts();
      const a = offerFromIssues([issue], ctx);
      const b = offerFromIssues([structuredClone(issue)], ctx);
      expect(b).toEqual(a);
      expect(offerFromIssues.length).toBeLessThanOrEqual(2);
    });

    it('never offers an account the issue did not carry', () => {
      const r = offerFromIssues([severalAccounts()], ctx);
      if (r.kind !== 'OFFER') throw new Error('expected an offer');
      expect(r.options.map((o) => o.ref)).toEqual([{ bankAccountId: 'b1' }, { bankAccountId: 'b2' }]);
    });
  });

  describe('AC-10 look-alike Customers', () => {
    const [stored, written] = LOOK_ALIKE_PAIRS[0]; // 'Аcme Corp' (Cyrillic А) vs 'Acme Corp'
    it('adds the email to each button when two folded names are equal', () => {
      const r = offerFromIssues(
        [ambiguous([cust('c1', written, 'a@x.test'), cust('c2', stored, 'b@x.test')])],
        ctx
      );
      if (r.kind !== 'OFFER') throw new Error('expected an offer');
      expect(r.options.map((o) => o.label)).toEqual([`${written} (a@x.test)`, `${stored} (b@x.test)`]);
      expect(r.options[1].ref).toEqual({ customerId: 'c2' });
    });

    it('shows "no email" for a look-alike Customer without one', () => {
      const r = offerFromIssues([ambiguous([cust('c1', written, 'a@x.test'), cust('c2', stored, null)])], ctx);
      if (r.kind !== 'OFFER') throw new Error('expected an offer');
      expect(r.options[1].label).toBe(`${stored} (no email)`);
    });

    it('case-only duplicates also count as look-alikes', () => {
      const r = offerFromIssues([ambiguous([cust('c1', 'Acme Corp', 'a@x.test'), cust('c2', 'ACME  CORP', null)])], ctx);
      if (r.kind !== 'OFFER') throw new Error('expected an offer');
      expect(r.options.map((o) => o.label)).toEqual(['Acme Corp (a@x.test)', 'ACME  CORP (no email)']);
    });

    it('distinct names carry no suffix, only the look-alike ones do', () => {
      const r = offerFromIssues(
        [ambiguous([cust('c1', 'Acme GmbH'), cust('c2', 'Acme Corp', 'a@x.test'), cust('c3', stored, null)])],
        ctx
      );
      if (r.kind !== 'OFFER') throw new Error('expected an offer');
      expect(r.options.map((o) => o.label)).toEqual(['Acme GmbH', 'Acme Corp (a@x.test)', `${stored} (no email)`]);
    });
  });

  describe('AC-14 the 8-button cap', () => {
    it('12 matches: TOO_MANY with the count', () => {
      expect(offerFromIssues([manyCustomers(12)], ctx)).toEqual({ kind: 'TOO_MANY', count: 12 });
    });
    it('8 options: an offer of 8 with optionIds 0..7', () => {
      const r = offerFromIssues([manyCustomers(8)], ctx);
      if (r.kind !== 'OFFER') throw new Error('expected an offer');
      expect(r.options.map((o) => o.optionId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
    it('9 options: TOO_MANY 9', () => {
      expect(offerFromIssues([manyCustomers(9)], ctx)).toEqual({ kind: 'TOO_MANY', count: 9 });
    });
    // Review 2026-10-13 R12-2: product candidates are capped at 50; the count is the real number of matches.
    it('60 matching products (50 listed, total 60): TOO_MANY 60', () => {
      const products = Array.from({ length: 50 }, (_, i) => ({
        productId: `p${i}`,
        name: { freelancerText: `Audit ${i}` },
        unit: 'h',
        price: '1.00',
        currency: 'USD' as const,
      }));
      const issue = { kind: 'PRODUCT_AMBIGUOUS', lineIndex: 0, written: 'audit', candidates: products, total: 60 } as DraftIssue;
      expect(offerFromIssues([issue], ctx)).toEqual({ kind: 'TOO_MANY', count: 60 });
    });
  });

  describe('other kinds', () => {
    it('SENDER_PROFILE_NOT_FOUND offers the profiles by name', () => {
      const r = offerFromIssues(
        [
          {
            kind: 'SENDER_PROFILE_NOT_FOUND',
            written: 'x',
            options: [],
            profiles: [
              { senderProfileId: 's1', name: { freelancerText: 'Main' } },
              { senderProfileId: 's2', name: { freelancerText: 'Side' } },
            ],
          },
        ],
        ctx
      );
      expect(r).toEqual({
        kind: 'OFFER',
        offerKind: 'SENDER_PROFILE',
        lineIndex: null,
        options: [
          { optionId: 0, label: 'Main', ref: { senderProfileId: 's1' } },
          { optionId: 1, label: 'Side', ref: { senderProfileId: 's2' } },
        ],
      });
    });

    it('DEFAULT_PROFILE_WITHOUT_ACCOUNT offers otherProfiles', () => {
      const r = offerFromIssues(
        [
          {
            kind: 'DEFAULT_PROFILE_WITHOUT_ACCOUNT',
            defaultSenderProfileId: 's0',
            otherProfiles: [{ senderProfileId: 's1', name: { freelancerText: 'Main' } }],
          },
        ],
        ctx
      );
      expect(r).toMatchObject({ kind: 'OFFER', offerKind: 'SENDER_PROFILE' });
    });

    it('NO_ACCOUNT_IN_CURRENCY with one other profile is an offer of one', () => {
      const r = offerFromIssues(
        [
          {
            kind: 'NO_ACCOUNT_IN_CURRENCY',
            currency: 'EUR',
            senderProfileId: 's0',
            accounts: [],
            otherProfiles: [{ senderProfileId: 's1', name: { freelancerText: 'Euro' } }],
          },
        ],
        ctx
      );
      expect(r).toMatchObject({ kind: 'OFFER', offerKind: 'SENDER_PROFILE' });
      if (r.kind === 'OFFER') expect(r.options).toHaveLength(1);
    });

    it('NO_ACCOUNT_IN_CURRENCY with empty otherProfiles is NONE', () => {
      expect(
        offerFromIssues(
          [{ kind: 'NO_ACCOUNT_IN_CURRENCY', currency: 'EUR', senderProfileId: 's0', accounts: [], otherProfiles: [] }],
          ctx
        )
      ).toEqual({ kind: 'NONE' });
    });

    it('CURRENCY_UNCLEAR offers only the Currency codes the resolver found', () => {
      const r = offerFromIssues([{ kind: 'CURRENCY_UNCLEAR', written: '$', options: ['USD', 'CAD', 'UAH', 'dollar'] }], ctx);
      expect(r).toEqual({
        kind: 'OFFER',
        offerKind: 'CURRENCY',
        lineIndex: null,
        options: [
          { optionId: 0, label: 'USD', ref: { currency: 'USD' } },
          { optionId: 1, label: 'UAH', ref: { currency: 'UAH' } },
        ],
      });
    });

    it('BANK_ACCOUNT_NOT_FOUND and BANK_ACCOUNT_AMBIGUOUS offer the accounts', () => {
      const accounts = [account('b1', 'Mono', '1234')];
      for (const kind of ['BANK_ACCOUNT_NOT_FOUND', 'BANK_ACCOUNT_AMBIGUOUS'] as const) {
        const r = offerFromIssues([{ kind, written: 'x', accounts }], ctx);
        expect(r).toMatchObject({ kind: 'OFFER', offerKind: 'BANK_ACCOUNT' });
      }
    });

    it('PRODUCT_AMBIGUOUS offers products with the line index and the price in the invoice currency', () => {
      expect(offerFromIssues([productIssue(2)], ctx)).toEqual({
        kind: 'OFFER',
        offerKind: 'PRODUCT',
        lineIndex: 2,
        options: [
          { optionId: 0, label: 'Design · hour · 50.00 USD', ref: { productId: 'p1' } },
          { optionId: 1, label: 'Design pro · day · 400.00 USD', ref: { productId: 'p2' } },
        ],
      });
    });

    it('an empty issue list is NONE', () => {
      expect(offerFromIssues([], ctx)).toEqual({ kind: 'NONE' });
    });

    it.each<[string, DraftIssue]>([
      ['LINE_AMOUNT_MISSING', { kind: 'LINE_AMOUNT_MISSING', lineIndex: 0, description: 'x' }],
      ['LINE_QUANTITY_MISSING', { kind: 'LINE_QUANTITY_MISSING', lineIndex: 0, description: 'x' }],
      [
        'LINE_PRICE_MISSING_IN_CURRENCY',
        { kind: 'LINE_PRICE_MISSING_IN_CURRENCY', lineIndex: 0, currency: 'USD', products: [] },
      ],
      ['PRODUCT_NOT_FOUND', { kind: 'PRODUCT_NOT_FOUND', lineIndex: 0, written: 'x' }],
      ['FIELD_INVALID', { kind: 'FIELD_INVALID', field: 'a', message: 'b' }],
      ['NO_SENDER_PROFILE_WITH_ACCOUNT', { kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' }],
      ['CUSTOMER_NOT_FOUND', { kind: 'CUSTOMER_NOT_FOUND', written: 'x' }],
      [
        'BANK_ACCOUNT_CURRENCY_MISMATCH',
        {
          kind: 'BANK_ACCOUNT_CURRENCY_MISMATCH',
          written: 'x',
          currency: 'USD',
          senderProfileId: 's',
          account: { bankAccountId: 'b', label: 'l', currency: 'EUR' },
        },
      ],
    ])('%s is NONE', (_name, issue) => {
      expect(offerFromIssues([issue], ctx)).toEqual({ kind: 'NONE' });
    });
  });
});

describe('storedOfferOptionSchema', () => {
  it('accepts { optionId, label, ref } with a one-key ref', () => {
    expect(storedOfferOptionSchema.safeParse({ optionId: 0, label: 'Acme', ref: { customerId: 'c1' } }).success).toBe(true);
    expect(storedOfferOptionSchema.safeParse({ optionId: 3, label: 'USD', ref: { currency: 'USD' } }).success).toBe(true);
  });
  it('rejects an empty label, an out-of-range optionId, a missing ref and extra keys', () => {
    expect(storedOfferOptionSchema.safeParse({ optionId: 0, label: '', ref: { customerId: 'c1' } }).success).toBe(false);
    expect(storedOfferOptionSchema.safeParse({ optionId: 8, label: 'a', ref: { customerId: 'c1' } }).success).toBe(false);
    expect(storedOfferOptionSchema.safeParse({ optionId: 0, label: 'a' }).success).toBe(false);
    expect(
      storedOfferOptionSchema.safeParse({ optionId: 0, label: 'a', ref: { customerId: 'c1' }, extra: 1 }).success
    ).toBe(false);
  });
});

describe('no model path', () => {
  it.each(['offers.ts', 'pin.ts'])('%s imports no AI SDK or model code', (file) => {
    const src = readFileSync(`lib/services/assistant-drafts/${file}`, 'utf8');
    expect(src).not.toMatch(/from\s+['"](@mastra|ai|@ai-sdk)[/'"]/);
    expect(src).not.toMatch(/from\s+['"]@\/lib\/ai/);
  });
});
