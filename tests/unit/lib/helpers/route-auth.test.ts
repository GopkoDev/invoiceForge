// T09 (spec.md §5 AC-21, adr/0002-treat-sessions-without-a-live-account-as-visitors.md) — a
// session whose `User` row is gone must be treated exactly like no session at all.
//
// ADR-0002, Considered options, option 1 (chosen), verbatim: "Add a requireLiveUser() guard to
// the (protected) and (invoice-editor) layouts... The stale token is cleared and the device
// lands on sign-in (SCR-01)." Checklist row (task file): "Add requireLiveUser() (server-only):
// no user.id -> redirect('/login') after clearing the session cookie via
// signOut({ redirect: false }) or equivalent — lib/helpers/route-auth.ts".
//
// Lead design decision (a layout is a server component and can't write cookies, and calling
// `signOut()` from one throws at runtime; an uncleared cookie would also loop back through
// proxy.ts's "logged in" branch): `requireLiveUser()` redirects to `/api/auth/clear-session`
// instead of calling `signOut()` itself — a route handler that clears the cookie(s) and then
// redirects on to `/login`. `signOut()` is asserted as NOT called here; cookie clearing moved to
// that route handler (tests/unit/api/clear-session.test.ts).
//
// test-plan.md row AC-21 "session whose account no longer exists is treated as a Visitor"
// (integration) covers the guard end to end through a real route/action; this unit-level test
// isolates just the guard function itself, which is the seam both group layouts call.
//
// Seam: this test mocks '@/auth' (auth + signOut) and 'next/navigation' (redirect) so it can
// drive the outcome directly rather than minting a real next-auth JWT/session outside a request
// context. `redirect()` is modeled as throwing (as it does for real, via NEXT_REDIRECT), so a
// caller either observes the thrown redirect or the resolved live userId — never both.
import { describe, expect, it, vi, beforeEach } from 'vitest';

// requireLiveUser() itself never touches the database (it only inspects the session), but
// route-auth.ts's module scope also imports '@/prisma' for requireSession()'s own live-account
// check (T05) — that module throws at import time without a DATABASE_URL. This unit test isolates
// requireLiveUser() from that unrelated concern rather than reaching for a real database.
vi.mock('@/prisma', () => ({ prisma: {} }));

const authMock = vi.fn<() => Promise<{ user?: { id?: string } } | null>>();
const signOutMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', async (importOriginal) => ({
  // Keep the real unstable_rethrow: it recognises Next's internal control-flow errors.
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (url: string) => redirectMock(url),
}));

import { requireLiveUser } from '@/lib/helpers/route-auth';

describe('requireLiveUser (AC-21, ADR-0002)', () => {
  beforeEach(() => {
    authMock.mockReset();
    signOutMock.mockReset();
    redirectMock.mockClear();
  });

  it('redirects to the cookie-clearing route when there is no session at all', async () => {
    authMock.mockResolvedValue(null);

    await expect(requireLiveUser()).rejects.toThrow('REDIRECT:/api/auth/clear-session');

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('redirects to the cookie-clearing route for a session with no live user id', async () => {
    // Mirrors the auth.ts session callback's behaviour once the User row is gone: session.user
    // exists but carries no id.
    authMock.mockResolvedValue({ user: {} });

    await expect(requireLiveUser()).rejects.toThrow('REDIRECT:/api/auth/clear-session');

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('fails closed (redirects) when auth() itself throws, e.g. the session callback DB lookup is down', async () => {
    authMock.mockRejectedValue(new Error('DB down'));

    await expect(requireLiveUser()).rejects.toThrow('REDIRECT:/api/auth/clear-session');

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("rethrows Next's dynamic-rendering signal from auth() instead of treating it as no session", async () => {
    const dynamicUsage = Object.assign(new Error('Dynamic server usage: headers'), {
      digest: 'DYNAMIC_SERVER_USAGE',
    });
    authMock.mockRejectedValue(dynamicUsage);

    await expect(requireLiveUser()).rejects.toBe(dynamicUsage);

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('returns the live userId without touching the session when the account still exists', async () => {
    authMock.mockResolvedValue({ user: { id: 'user_1' } });

    const result = await requireLiveUser();

    expect(result).toEqual({ userId: 'user_1' });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
