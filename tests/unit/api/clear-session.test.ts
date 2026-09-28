// T09 (spec.md §5 AC-21, adr/0002-treat-sessions-without-a-live-account-as-visitors.md) —
// `requireLiveUser()` redirects a stale token here instead of calling `signOut()` from a layout
// (a server component can't write cookies, and an uncleared cookie would loop back through
// proxy.ts's "logged in" branch). This route must actually clear the session cookie(s) and land
// the browser on sign-in.
//
// F-28: this path is on the public allowlist (both a signed-in and a signed-out caller must
// reach it), which also means a cross-site GET (an <img>, a bare link) can drive any visitor's
// browser to it directly. It must not clear a *live* session that way — only a session whose
// `User` row is actually gone (this route's whole reason to exist) gets cleared.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const authMock = vi.fn<() => Promise<{ user?: { id?: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const findUniqueMock = vi.fn();
vi.mock('@/prisma', () => ({ prisma: { user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } } }));

import { GET } from '@/app/api/auth/clear-session/route';

function buildRequest(cookieHeader: string) {
  return new NextRequest('https://app.example.test/api/auth/clear-session', {
    headers: { cookie: cookieHeader },
  });
}

describe('GET /api/auth/clear-session (AC-21)', () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
    // Default: no session at all, i.e. the stale-token case this route exists for.
    authMock.mockResolvedValue(null);
  });

  it('does not clear the session cookies when the caller has a live session (F-28)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user_1' } });
    findUniqueMock.mockResolvedValue({ id: 'user_1' });

    const res = await GET(
      buildRequest('authjs.session-token=live-jwt; __Secure-authjs.session-token=live-jwt-secure')
    );

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).not.toBe('/login');

    const setCookie = res.headers.getSetCookie?.() ?? [];
    expect(setCookie).toHaveLength(0);
  });

  it('marks __Secure- cookie deletions Secure, or browsers ignore them on https', async () => {
    const res = await GET(
      buildRequest('__Secure-authjs.session-token=stale; __Secure-authjs.session-token.0=chunk')
    );

    const setCookie = res.headers.getSetCookie();
    const secureDeletions = setCookie.filter((c) => c.startsWith('__Secure-'));
    expect(secureDeletions).toHaveLength(2);
    for (const cookie of secureDeletions) {
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*Path=\//i);
    }
  });

  it('redirects to /login and clears the session cookies', async () => {
    const res = await GET(
      buildRequest('authjs.session-token=stale-jwt; __Secure-authjs.session-token=stale-jwt-secure')
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).toBe('/login');

    const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const joined = setCookie.join('\n');
    expect(joined).toMatch(/authjs\.session-token=;/);
    expect(joined).toMatch(/__Secure-authjs\.session-token=;/);
  });

  it('also clears chunked session cookies (large JWTs split into .0, .1, ...)', async () => {
    const res = await GET(
      buildRequest(
        'authjs.session-token.0=part-a; authjs.session-token.1=part-b; other-cookie=keep-me'
      )
    );

    expect(res.status).toBe(302);
    const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const joined = setCookie.join('\n');
    expect(joined).toMatch(/authjs\.session-token\.0=;/);
    expect(joined).toMatch(/authjs\.session-token\.1=;/);
    expect(joined).not.toMatch(/other-cookie=;/);
  });
});
