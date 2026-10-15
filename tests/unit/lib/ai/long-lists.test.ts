// Review 2026-10-13 R2-B2, R3-B3, R3-B4, R4-B1, R4-B2 (ai-chat-v2 AC-14): the propose_draft answer drops every list
// longer than 8, in any issue, and carries each one's count and a directive; lists of 8 or fewer stay whole.
import { describe, expect, it, vi } from 'vitest';
import type { DraftIssue } from '@/lib/services/assistant-drafts/schema';

vi.mock('@/prisma', () => ({ prisma: {} }));

const { issuesAnswer, withoutLongLists } = await import('@/lib/ai/tools/propose-draft');

const many = <T,>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i));
const customer = (i: number) => ({ customerId: `c${i}`, name: { freelancerText: `Studio ${i}` }, email: null });
const account = (i: number) => ({ bankAccountId: `b${i}`, label: `Bank ${i}` });
const profile = (i: number) => ({ senderProfileId: `s${i}`, name: { freelancerText: `Profile ${i}` } });

describe('withoutLongLists', () => {
  it('strips candidates, accounts, profiles and other profiles above 8, with their counts', () => {
    const issues = [
      { kind: 'CUSTOMER_AMBIGUOUS', written: 'Studio', candidates: many(12, customer) },
      { kind: 'BANK_ACCOUNT_AMBIGUOUS', written: 'Bank', accounts: many(9, account) },
      { kind: 'SENDER_PROFILE_NOT_FOUND', written: 'X', options: many(10, (i) => `Profile ${i}`), profiles: many(10, profile) },
      { kind: 'DEFAULT_PROFILE_WITHOUT_ACCOUNT', defaultSenderProfileId: 'sp', otherProfiles: many(9, profile) },
    ] as unknown as DraftIssue[];
    const { issues: shown, counts } = withoutLongLists(issues);
    expect(counts).toEqual([12, 9, 10, 9]);
    expect(JSON.stringify(shown)).not.toMatch(/Studio \d|Bank \d|Profile \d/);
  });

  it('keeps lists of 8 or fewer, and NO_ACCOUNT_IN_CURRENCY accounts (the profile own accounts), with no count', () => {
    const issues = [
      { kind: 'CUSTOMER_AMBIGUOUS', written: 'Studio', candidates: many(8, customer) },
      { kind: 'NO_ACCOUNT_IN_CURRENCY', currency: 'EUR', accounts: many(9, account), otherProfiles: [] },
    ] as unknown as DraftIssue[];
    const { issues: shown, counts } = withoutLongLists(issues);
    expect(shown).toEqual(issues);
    expect(counts).toEqual([null, null]);
  });
});

describe('issuesAnswer', () => {
  const issues = [{ kind: 'CUSTOMER_AMBIGUOUS', written: 'Studio', candidates: many(12, customer) }] as unknown as DraftIssue[];

  it('with no match count (the offer was not dropped) a long list is still dropped, with no matchCount (R4-B2)', () => {
    const answer = issuesAnswer(issues, undefined);
    expect(answer).toMatchObject({ kind: 'ISSUES', listCounts: [12] });
    expect(answer).not.toHaveProperty('matchCount');
  });

  it('with a match count it carries the count, the directive and the per-issue counts, and no names', () => {
    const answer = issuesAnswer(issues, 12);
    expect(answer).toMatchObject({ kind: 'ISSUES', matchCount: 12, listCounts: [12] });
    expect(String(answer.say)).toContain('Name none of the records counted here');
    expect(JSON.stringify(answer)).not.toContain('Studio 1');
  });
});

// Review 2026-10-13 R4-B1, R4-B2: any list above 8 is dropped, whichever issue comes first, and the directive to the
// model says each dropped list's count in words that fit its kind.
describe('issuesAnswer: long lists after the first issue, and the directive', () => {
  const product = (i: number) => ({ productId: `p${i}`, name: { freelancerText: `Audit ${i}` }, unit: 'h', price: '1.00', currency: 'USD' });

  it('a long list in a later issue is dropped even when the first issue has buttons (no match count)', () => {
    const issues = [
      { kind: 'CUSTOMER_AMBIGUOUS', written: 'Acme', candidates: many(2, customer) },
      { kind: 'PRODUCT_AMBIGUOUS', written: 'audit', lineIndex: 0, candidates: many(12, product) },
    ] as unknown as DraftIssue[];
    const answer = issuesAnswer(issues, undefined, true);
    expect(answer).toMatchObject({ kind: 'ISSUES', listCounts: [null, 12] });
    expect(answer).not.toHaveProperty('matchCount');
    expect(JSON.stringify(answer.issues)).not.toContain('Audit 1');
    expect(JSON.stringify(answer.issues)).toContain('Studio 1');
    expect(String(answer.say)).toContain('12 products match audit.');
    // Review 2026-10-13 R5-B3: the buttons answer the first question; the directive covers only the counted records.
    expect(String(answer.say)).toMatch(/^The buttons cover the first question; for the rest: /);
    expect(String(answer.say)).toContain('Name none of the records counted here');
    expect(String(answer.say)).not.toContain('ask for a more exact name');
  });

  it('a name that matched nothing is not described as matching in the directive', () => {
    const issues = [{ kind: 'BANK_ACCOUNT_NOT_FOUND', written: 'Zeta', accounts: many(11, account) }] as unknown as DraftIssue[];
    const say = String(issuesAnswer(issues, 11).say);
    expect(say).toContain('No bank account matches Zeta. You have 11 bank accounts');
    expect(say).not.toMatch(/11 bank accounts match/);
    expect(say).toContain('Name none of the records counted here');
  });

  it('nothing dropped: no counts and no directive', () => {
    const issues = [{ kind: 'CUSTOMER_AMBIGUOUS', written: 'Acme', candidates: many(2, customer) }] as unknown as DraftIssue[];
    const answer = issuesAnswer(issues, undefined);
    expect(answer).not.toHaveProperty('listCounts');
    expect(answer).not.toHaveProperty('say');
  });
});

// Review 2026-10-13 R12-2: a capped product list counts all its matches, not the 50 it lists.
describe('withoutLongLists: a capped product list', () => {
  it('counts the total, not the 50 listed', () => {
    const product = (i: number) => ({ productId: `p${i}`, name: { freelancerText: `Audit ${i}` }, unit: 'h', price: '1.00', currency: 'USD' });
    const issues = [{ kind: 'PRODUCT_AMBIGUOUS', written: 'audit', lineIndex: 0, candidates: many(50, product), total: 60 }] as unknown as DraftIssue[];
    expect(withoutLongLists(issues).counts).toEqual([60]);
  });
});
