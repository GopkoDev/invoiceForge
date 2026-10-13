// ai-chat-v2 T09 (AC-05b; contracts/openapi.yaml DraftIssueDelta): CUSTOMER_NOT_FOUND may carry
// ownSenderProfile. The issue text explains it (en, uk) and propose_draft adds no "Add a Customer" link for it.
import { describe, expect, it, vi } from 'vitest';
import { issuesText } from '@/lib/ai/issue-text';
import { draftIssueSchema, type DraftIssue } from '@/lib/services/assistant-drafts/schema';

vi.mock('@/prisma', () => ({ prisma: {} }));

const plain = { kind: 'CUSTOMER_NOT_FOUND', written: 'Consulting FOP' } as DraftIssue;
const hinted = {
  kind: 'CUSTOMER_NOT_FOUND',
  written: 'Consulting FOP',
  ownSenderProfile: { senderProfileId: 'sp1', name: { freelancerText: 'Consulting FOP' } },
} as DraftIssue;

const EN =
  'Consulting FOP is your own sender profile — the business you invoice from. A Customer is the one who pays. Which Customer should this invoice go to?';
const UK =
  'Consulting FOP — це ваш профіль відправника, бізнес, від імені якого ви виставляєте інвойси. Клієнт — це той, хто платить. Якому клієнту виставити цей інвойс?';

describe('own sender profile hint (ai-chat-v2 T09)', () => {
  it('the issue schema accepts CUSTOMER_NOT_FOUND with and without ownSenderProfile', () => {
    expect(draftIssueSchema.safeParse(plain).success).toBe(true);
    const parsed = draftIssueSchema.safeParse(hinted);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual(hinted);
  });

  it('en: explains the profile is the Freelancer\'s own business and asks which Customer', () => {
    expect(issuesText([hinted], 'en')).toBe(EN);
  });

  it('en: the plain not-found sentence is unchanged', () => {
    expect(issuesText([plain], 'en')).toBe('You have no Customer called Consulting FOP. Add the Customer first.');
  });

  it('uk: names the profile and differs from the plain not-found sentence', () => {
    const text = issuesText([hinted], 'uk');
    expect(text).toContain('Consulting FOP');
    expect(text).not.toBe(issuesText([plain], 'uk'));
    expect(text).toBe(UK);
  });

  it('uses the profile\'s saved name, not the written variant', () => {
    const variant = { ...hinted, written: 'consulting  fop' } as DraftIssue;
    expect(issuesText([variant], 'en')).toBe(EN);
  });

  it('linksFor: no new-customer link with the hint, still one for a plain CUSTOMER_NOT_FOUND', async () => {
    const { linksFor } = await import('@/lib/ai/tools/propose-draft');
    expect(linksFor([hinted])).not.toContainEqual({ kind: 'page', page: 'new-customer' });
    expect(linksFor([plain])).toContainEqual({ kind: 'page', page: 'new-customer' });
  });
});
