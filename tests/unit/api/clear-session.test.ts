// T09 (spec.md §5 AC-21, adr/0002-treat-sessions-without-a-live-account-as-visitors.md) —
// `requireLiveUser()` redirects a stale token here instead of calling `signOut()` from a layout
// (a server component can't write cookies, and an uncleared cookie would loop back through
// proxy.ts's "logged in" branch). This route must actually clear the session cookie(s) and land
// the browser on sign-in.
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/clear-session/route';

function buildRequest(cookieHeader: string) {
  return new NextRequest('https://app.example.test/api/auth/clear-session', {
    headers: { cookie: cookieHeader },
  });
}

describe('GET /api/auth/clear-session (AC-21)', () => {
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
