// T8 - per-scope limit config (data-model.md §LimitEvent, Outcomes per scope).
// Seam assumed (lib/security/limits/scopes.ts): `LIMIT_SCOPES[scope] = { windowMs, max, countedOutcomes }`.
import { describe, expect, it } from 'vitest';
import { LIMIT_SCOPES } from '@/lib/security/limits/scopes';

describe('limit scopes (T8)', () => {
  it('SIGNIN_SOURCE: 30 REQUESTED per 5 minutes (AC-13)', () => {
    expect(LIMIT_SCOPES.SIGNIN_SOURCE).toEqual({
      windowMs: 5 * 60_000,
      max: 30,
      countedOutcomes: ['REQUESTED'],
    });
  });
  it('SIGNIN_ADDRESS: 5 SENT per hour (AC-12)', () => {
    expect(LIMIT_SCOPES.SIGNIN_ADDRESS).toEqual({
      windowMs: 60 * 60_000,
      max: 5,
      countedOutcomes: ['SENT'],
    });
  });
  it('EXPORT: 3 STARTED per hour', () => {
    expect(LIMIT_SCOPES.EXPORT).toEqual({
      windowMs: 60 * 60_000,
      max: 3,
      countedOutcomes: ['STARTED'],
    });
  });
});
