// AC-29 (spec.md §5) depends on every action refusing to run before a caller's ownership can be
// checked - the shared gate is getAuthenticatedUser() (sad.md §2 Conventions, verbatim:
// "getAuthenticatedUser() runs first, then queries are scoped by userId"). Checklist row (task
// file): "getAuthenticatedUser() -> fail('UNAUTHORIZED', 'Not signed in.'); its internal catch ->
// FAILED - lib/helpers/auth-helpers.ts".
//
// Contract (contracts/server-actions.md §ActionResult, Code -> destination):
//   UNAUTHORIZED | no session, or a token without a live account (ADR-0002).
// FAILED's row: "anything else. The detail goes to console.error + Sentry" - so the raw error
// from an auth() throw must never reach the returned `error` string.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';

describe('getAuthenticatedUser (AC-29, ADR-0009)', () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it('returns a coded UNAUTHORIZED failure when there is no session', async () => {
    authMock.mockResolvedValue(null);

    const result = await getAuthenticatedUser();

    expect(result).toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not signed in.',
    });
  });

  it('returns a coded UNAUTHORIZED failure for a session without a live account id', async () => {
    authMock.mockResolvedValue({ user: {} });

    const result = await getAuthenticatedUser();

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected a failure result');
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns a coded FAILED result with a plain message when auth() throws, never the raw error', async () => {
    authMock.mockRejectedValue(new Error('ECONNREFUSED: session store unreachable'));

    const result = await getAuthenticatedUser();

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected a failure result');
    expect(result.code).toBe('FAILED');
    expect(result.error).not.toContain('ECONNREFUSED');
  });

  it('returns the userId as data on a live session', async () => {
    authMock.mockResolvedValue({ user: { id: 'user_1' } });

    const result = await getAuthenticatedUser();

    expect(result).toEqual({ success: true, data: { userId: 'user_1' } });
  });
});
