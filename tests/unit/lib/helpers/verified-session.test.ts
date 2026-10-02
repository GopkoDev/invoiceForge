// T4 (security-patch, spec.md §5 AC-04 / AC-05): one predicate decides "signed in".
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
const authMock = vi.fn<() => Promise<unknown>>();
vi.mock('@/auth', () => ({ auth: () => authMock(), signOut: vi.fn() }));

import { isVerifiedSession } from '@/lib/helpers/verified-session';
import authConfig from '@/auth.config';
import { requireSession } from '@/lib/helpers/route-auth';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';

describe('isVerifiedSession (AC-04)', () => {
  it.each<[string, unknown, boolean]>([
    ['null', null, false],
    ['undefined', undefined, false],
    ['empty object', {}, false],
    ['user without id', { user: {} }, false],
    ['empty id', { user: { id: '' } }, false],
    ['numeric id', { user: { id: 5 } }, false],
    [
      'Auth.js error-shaped object',
      { message: 'There was a problem with the server configuration.' },
      false,
    ],
    ['verified session', { user: { id: 'u1' } }, true],
  ])('%s -> %s', (_n, input, expected) => {
    expect(isVerifiedSession(input)).toBe(expected);
  });
});

// Unit check of the callback in isolation; the AC-05 contract test against real Auth.js output
// (real JWT through the NextAuth wrapper) lives in verified-session-contract.test.ts.
describe('edge session callback (unit)', () => {
  it('copies the JWT account id into session.user.id, which isVerifiedSession accepts', async () => {
    const callback = authConfig.callbacks?.session as unknown as (
      a: unknown
    ) => Promise<unknown> | unknown;
    expect(callback).toBeTypeOf('function');
    // Shape Auth.js hands the session callback after the jwt callback ran (token.id set at sign-in).
    const session = await callback({
      session: {
        user: { name: null, email: 'a@b.test', image: null },
        expires: new Date(Date.now() + 1e6).toISOString(),
      },
      token: { id: 'u1', sub: 'u1', email: 'a@b.test' },
    });
    expect(isVerifiedSession(session)).toBe(true);
  });
});

describe('guards use the predicate (AC-04)', () => {
  beforeEach(() => authMock.mockReset());
  const errorObject = {
    message: 'There was a problem with the server configuration.',
  };

  it('requireSession refuses an Auth.js error object with 401', async () => {
    authMock.mockResolvedValue(errorObject);
    const result = await requireSession();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('requireSession refuses a non-string user id', async () => {
    authMock.mockResolvedValue({ user: { id: { $ne: '' } } });
    const result = await requireSession();
    expect(result.ok).toBe(false);
  });

  it('getAuthenticatedUser refuses a non-string user id', async () => {
    authMock.mockResolvedValue({ user: { id: 42 } });
    const result = await getAuthenticatedUser();
    expect(result.success).toBe(false);
  });
});
