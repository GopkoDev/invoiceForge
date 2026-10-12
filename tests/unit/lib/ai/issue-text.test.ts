// Fix 2026-10-12 (review R6-6): the fallback words for a propose_draft ISSUES turn the model leaves
// without text. Every issue kind gets a sentence in English and in Ukrainian.
import { describe, expect, it } from 'vitest';
import { issuesText } from '@/lib/ai/issue-text';
import {
  draftIssueSchema,
  type DraftIssue,
} from '@/lib/services/assistant-drafts/schema';

const name = (text: string) => ({ freelancerText: text });
const account = { bankAccountId: 'ba1', label: 'Privat ••1234' };

const ISSUES: DraftIssue[] = [
  { kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' },
  {
    kind: 'DEFAULT_PROFILE_WITHOUT_ACCOUNT',
    defaultSenderProfileId: 'sp1',
    otherProfiles: [],
  },
  { kind: 'CUSTOMER_NOT_FOUND', written: 'Globex' },
  {
    kind: 'CUSTOMER_AMBIGUOUS',
    written: 'Acme',
    candidates: [
      { customerId: 'c1', name: name('Acme Corp') },
      { customerId: 'c2', name: name('Acme GmbH') },
    ],
  },
  {
    kind: 'CUSTOMER_NEAR_MISS',
    written: 'Acm',
    candidates: [{ customerId: 'c1', name: name('Acme Corp') }],
  },
  { kind: 'LINE_AMOUNT_MISSING', lineIndex: 0, description: 'website' },
  {
    kind: 'LINE_PRICE_MISSING_IN_CURRENCY',
    lineIndex: 0,
    currency: 'EUR',
    products: [{ productId: 'p1', name: name('WEB DEV'), currency: 'USD' }],
  },
  { kind: 'CURRENCY_UNCLEAR', written: 'bucks', options: ['USD', 'UAH'] },
  { kind: 'SENDER_PROFILE_NOT_FOUND', written: 'Side', options: ['Main'] },
  {
    kind: 'NO_ACCOUNT_IN_CURRENCY',
    currency: 'USD',
    senderProfileId: 'sp1',
    accounts: [{ ...account, currency: 'UAH' }],
    otherProfiles: [{ senderProfileId: 'sp2', name: name('Dmytro Hopko') }],
  },
  {
    kind: 'SEVERAL_ACCOUNTS_IN_CURRENCY',
    currency: 'USD',
    accounts: [account, { bankAccountId: 'ba2', label: 'Wise ••5678' }],
  },
  { kind: 'BANK_ACCOUNT_NOT_FOUND', written: 'Monzo', accounts: [account] },
  {
    kind: 'BANK_ACCOUNT_AMBIGUOUS',
    written: 'Bank',
    accounts: [account, { bankAccountId: 'ba2', label: 'Wise ••5678' }],
  },
  {
    kind: 'BANK_ACCOUNT_CURRENCY_MISMATCH',
    written: 'Privat',
    currency: 'USD',
    senderProfileId: 'sp1',
    account: { ...account, currency: 'UAH' },
  },
  { kind: 'LINE_QUANTITY_MISSING', lineIndex: 0, description: 'consulting' },
  {
    kind: 'PRODUCT_AMBIGUOUS',
    lineIndex: 0,
    written: 'consulting',
    candidates: [{ productId: 'p1', name: name('Consulting basic') }],
  },
  { kind: 'PRODUCT_NOT_FOUND', lineIndex: 0, written: 'design' },
  {
    kind: 'FIELD_INVALID',
    field: 'dueDate',
    message: "The due date can't be before the issue date.",
  },
];

describe('issuesText (fix 2026-10-12)', () => {
  it('the fixtures cover every DraftIssue kind', () => {
    const kinds = draftIssueSchema.options.map((o) => o.shape.kind.value);
    expect(new Set(ISSUES.map((i) => i.kind))).toEqual(new Set(kinds));
  });

  it.each(ISSUES.map((i) => [i.kind, i] as const))(
    '%s has an English and a Ukrainian sentence',
    (_kind, issue) => {
      const en = issuesText([issue], 'en');
      const uk = issuesText([issue], 'uk');
      for (const text of [en, uk]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/undefined|\[object Object\]/);
      }
      if (issue.kind !== 'FIELD_INVALID') expect(uk).toMatch(/[а-яіїєґ]/i);
    }
  );

  it('names the accounts and currencies of a mismatch', () => {
    const text = issuesText(
      [ISSUES.find((i) => i.kind === 'BANK_ACCOUNT_CURRENCY_MISMATCH')!],
      'en'
    );
    expect(text).toContain(
      'Privat ••1234 is in UAH, but the invoice is in USD'
    );
  });

  // fix 2026-10-12 (bug 5): the product in another currency and the other profile with an account are named.
  it('names a matching product in another currency, and another sender profile with an account in the currency', () => {
    const price = issuesText(
      [ISSUES.find((i) => i.kind === 'LINE_PRICE_MISSING_IN_CURRENCY')!],
      'en'
    );
    const account = issuesText(
      [ISSUES.find((i) => i.kind === 'NO_ACCOUNT_IN_CURRENCY')!],
      'uk'
    );
    expect(price).toContain('WEB DEV (USD)');
    expect(price).toContain('price in EUR');
    expect(account).toContain('Dmytro Hopko');
  });

  it('any language other than Ukrainian falls back to English, and several issues join into one paragraph', () => {
    const text = issuesText([ISSUES[2], ISSUES[5]], 'de');
    expect(text).toBe(
      'You have no Customer called Globex. Add the Customer first. What is the amount for "website"? Give the quantity and the price.'
    );
  });
});
