// Review 2026-10-13 R2-B2, R3-B3, R3-B4 (ai-chat-v2 AC-14): above 8 matches the propose_draft answer drops every list
// longer than 8 and carries each one's count; lists of 8 or fewer, and an answer with no match count, stay whole.
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

  it('with no match count the answer carries the issues whole', () => {
    expect(issuesAnswer(issues, undefined)).toMatchObject({ kind: 'ISSUES', issues });
  });

  it('with a match count it carries the count, the directive and the per-issue counts, and no names', () => {
    const answer = issuesAnswer(issues, 12);
    expect(answer).toMatchObject({ kind: 'ISSUES', matchCount: 12, listCounts: [12] });
    expect(String(answer.say)).toMatch(/List none of them/);
    expect(JSON.stringify(answer)).not.toContain('Studio 1');
  });
});
