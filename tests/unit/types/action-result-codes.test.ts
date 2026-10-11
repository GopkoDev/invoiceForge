// T03 (ai-assistant; spec.md §5 AC-10, AC-29, AC-31) - the new ActionErrorCode member and the
// three new ActionErrorDetails kinds (contracts/server-actions.md "ActionResult changes").
// The shapes are checked by the compiler (pnpm exec tsc --noEmit) as well as at run time, and
// the detail payloads are cross-checked against the zod DraftIssue schema.
import { describe, expect, it } from 'vitest';

import { draftIssueSchema } from '@/lib/services/assistant-drafts/schema';
import {
  fail,
  type ActionErrorCode,
  type ActionErrorDetails,
} from '@/types/result';

const ALL_CODES: ActionErrorCode[] = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'FAILED',
  'RATE_LIMITED',
];

describe('FORBIDDEN (AC-29)', () => {
  it('is a code fail() carries, with its plain-language message', () => {
    const result = fail('FORBIDDEN', 'This key can only read.');
    expect(result).toEqual({ success: false, code: 'FORBIDDEN', error: 'This key can only read.' });
  });

  it('is one of exactly seven codes', () => {
    expect(new Set(ALL_CODES).size).toBe(7);
  });
});

describe('ALLOWANCE_USED_UP (AC-10)', () => {
  it('carries the limit, when it renews and the time zone', () => {
    const details: ActionErrorDetails = {
      kind: 'ALLOWANCE_USED_UP',
      limit: 30,
      renewsAt: '2026-10-11T21:00:00.000Z',
      timeZone: 'Europe/Kyiv',
    };
    const result = fail('RATE_LIMITED', 'Today\'s allowance is used up.', { details });
    expect(result.details).toEqual(details);
  });
});

describe('DRAFT_ISSUES (AC-31)', () => {
  it('carries issues that are valid DraftIssue values', () => {
    const details: ActionErrorDetails = {
      kind: 'DRAFT_ISSUES',
      issues: [
        {
          kind: 'CUSTOMER_AMBIGUOUS',
          written: 'Acme',
          candidates: [
            { customerId: 'c1', name: { freelancerText: 'Acme Corp' } },
            { customerId: 'c2', name: { freelancerText: 'Acme GmbH' } },
          ],
        },
      ],
    };
    const result = fail('VALIDATION', 'Two Customers match "Acme".', { details });
    expect(result.details).toEqual(details);
    for (const issue of details.issues) {
      expect(draftIssueSchema.safeParse(issue).success).toBe(true);
    }
  });
});

describe('DRAFT_LIMIT_REACHED (AC-27)', () => {
  it('carries how many drafts were created, the allowance and when it renews', () => {
    const details: ActionErrorDetails = {
      kind: 'DRAFT_LIMIT_REACHED',
      created: 50,
      allowance: 50,
      renewsAt: '2026-10-11T21:00:00.000Z',
    };
    const result = fail('RATE_LIMITED', 'Daily draft limit reached.', { details });
    expect(result.details).toEqual(details);
  });
});
