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
vi.mock('@/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

import { GET } from '@/app/api/auth/clear-session/route';
import { requireLiveUser } from '@/lib/helpers/route-auth';
import { CLEAR_SESSION_PATH } from '@/config/routes.config';

function buildRequest(
  cookieHeader: string,
  options: { search?: string; referer?: string } = {}
) {
  const headers: Record<string, string> = { cookie: cookieHeader };
  if (options.referer) headers.referer = options.referer;
  return new NextRequest(
    `https://app.example.test/api/auth/clear-session${options.search ?? ''}`,
    { headers }
  );
}

describe('GET /api/auth/clear-session (AC-21)', () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
    // Default: the stale-token case this route exists for. The token decodes, but the session
    // callback found no live account for it, so `session.user` carries no id (a null session is
    // not enough: it is also what a failed check looks like).
    authMock.mockResolvedValue({ user: {} });
  });

  it('does not clear the session cookies when the caller has a live session (F-28)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user_1' } });
    findUniqueMock.mockResolvedValue({ id: 'user_1' });

    const res = await GET(
      buildRequest(
        'authjs.session-token=live-jwt; __Secure-authjs.session-token=live-jwt-secure'
      )
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
      buildRequest(
        '__Secure-authjs.session-token=stale; __Secure-authjs.session-token.0=chunk'
      )
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
      buildRequest(
        'authjs.session-token=stale-jwt; __Secure-authjs.session-token=stale-jwt-secure'
      )
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).toBe('/login');

    const setCookie = res.headers.getSetCookie?.() ?? [
      res.headers.get('set-cookie') ?? '',
    ];
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
    const setCookie = res.headers.getSetCookie?.() ?? [
      res.headers.get('set-cookie') ?? '',
    ];
    const joined = setCookie.join('\n');
    expect(joined).toMatch(/authjs\.session-token\.0=;/);
    expect(joined).toMatch(/authjs\.session-token\.1=;/);
    expect(joined).not.toMatch(/other-cookie=;/);
  });

  describe('a failed check never ends the session (AC-04)', () => {
    function expectNoCookieExpiry(res: Response) {
      expect(res.headers.getSetCookie()).toEqual([]);
    }

    it('answers 503 and keeps the cookies when auth() throws', async () => {
      authMock.mockRejectedValue(new Error('DB down'));

      const res = await GET(
        buildRequest('__Secure-authjs.session-token=live-jwt')
      );

      expect(res.status).toBe(503);
      expectNoCookieExpiry(res);
    });

    it('answers 503 and keeps the cookies when the account lookup throws', async () => {
      authMock.mockResolvedValue({ user: { id: 'user_1' } });
      findUniqueMock.mockRejectedValue(new Error('DB down'));

      const res = await GET(
        buildRequest('__Secure-authjs.session-token=live-jwt')
      );

      expect(res.status).toBe(503);
      expectNoCookieExpiry(res);
    });

    // @auth/core's session action swallows a throwing session callback (the DB lookup) or an
    // undecodable token (a rotated secret) and resolves `auth()` to null, so a null session while
    // a session cookie is present cannot be told apart from a failed check.
    it.each([
      '__Secure-authjs.session-token=live-jwt',
      'authjs.session-token.0=part-a; authjs.session-token.1=part-b',
    ])(
      'answers 503 and keeps the cookies for a null session while %s is present',
      async (cookie) => {
        authMock.mockResolvedValue(null);

        const res = await GET(buildRequest(cookie));

        expect(res.status).toBe(503);
        expectNoCookieExpiry(res);
      }
    );

    it('sends a caller with no session cookie at all to sign-in, clearing nothing', async () => {
      authMock.mockResolvedValue(null);

      const res = await GET(buildRequest('other-cookie=keep-me'));

      expect(res.status).toBe(302);
      expect(new URL(res.headers.get('location') as string).pathname).toBe(
        '/login'
      );
      expectNoCookieExpiry(res);
    });

    // The whole page path, not just this route. A private layout's
    // requireLiveUser() whose auth() throws must hand the request here (a real NEXT_REDIRECT, not
    // an error past the layout, which only app/global-error.tsx would catch), and this route,
    // hitting the same failing check, answers 503 with the session cookie left in place.
    it('a private page whose check throws lands here and gets 503 with the cookie kept', async () => {
      authMock.mockRejectedValue(new Error('DB down'));

      const thrown = await requireLiveUser().then(
        () => undefined,
        (error: unknown) => error
      );
      expect((thrown as { digest?: string } | undefined)?.digest).toMatch(
        new RegExp(`^NEXT_REDIRECT;[a-z]+;${CLEAR_SESSION_PATH};`)
      );

      const res = await GET(
        buildRequest('__Secure-authjs.session-token=live-jwt')
      );

      expect(res.status).toBe(503);
      expectNoCookieExpiry(res);
    });

    it('clears the cookies when its own lookup confirms the User row is gone', async () => {
      authMock.mockResolvedValue({ user: { id: 'user_1' } });
      findUniqueMock.mockResolvedValue(null);

      const res = await GET(
        buildRequest('__Secure-authjs.session-token=stale-jwt')
      );

      expect(res.status).toBe(302);
      expect(res.headers.getSetCookie().join('\n')).toMatch(
        /__Secure-authjs\.session-token=;/
      );
    });
  });

  // The "Try again" target comes from `?next=` or a same-origin Referer and is only ever a
  // same-origin relative path: anything else falls back to the dashboard.
  describe('the check-unavailable page (T32, R-04, AC-04)', () => {
    const LIVE_COOKIE = '__Secure-authjs.session-token=live-jwt';

    async function checkUnavailable(
      options: { search?: string; referer?: string } = {}
    ) {
      authMock.mockRejectedValue(new Error('DB down'));
      const res = await GET(buildRequest(LIVE_COOKIE, options));
      expect(res.status).toBe(503);
      return { res, html: await res.text() };
    }

    function tryAgainHref(html: string): string | null {
      const match = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*Try again\s*<\/a>/i.exec(
        html
      );
      return match ? match[1].replace(/&amp;/g, '&') : null;
    }

    it('is an HTML page in the LoadError wording, never cached, with Retry-After', async () => {
      const { res, html } = await checkUnavailable();

      expect(res.headers.get('content-type')).toMatch(/^text\/html;\s*charset=utf-8$/i);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toMatch(/<html lang="en"/);
      expect(html).toMatch(/We couldn(?:'|&#39;|&apos;)t load your data/);
      expect(html).toContain('Your data is safe');
      expect(html).toMatch(/still signed in/i);
      expect(res.headers.getSetCookie()).toEqual([]);
    });

    it('links "Try again" to the requested page from ?next=', async () => {
      const { html } = await checkUnavailable({
        search: `?next=${encodeURIComponent('/invoices/inv_1/edit?tab=items')}`,
      });

      expect(tryAgainHref(html)).toBe('/invoices/inv_1/edit?tab=items');
    });

    it('falls back to a same-origin Referer when there is no ?next=', async () => {
      const { html } = await checkUnavailable({
        referer: 'https://app.example.test/customers?page=2',
      });

      expect(tryAgainHref(html)).toBe('/customers?page=2');
    });

    it('links "Try again" to the dashboard when nothing names the requested page', async () => {
      const { html } = await checkUnavailable();

      expect(tryAgainHref(html)).toBe('/dashboard');
    });

    it.each([
      '//evil.example/phish',
      '/\\evil.example/phish',
      'https://evil.example/phish',
      'javascript:alert(1)',
      'dashboard',
      '/\r\nSet-Cookie:x=1',
      '/api/auth/clear-session?next=/dashboard',
      // Paths that normalise to a protocol-relative `//host`.
      '/.//evil.example',
      '/%2e%2e//evil.example',
    ])('never links "Try again" off-site or back here (next=%s)', async (next) => {
      const { html } = await checkUnavailable({
        search: `?next=${encodeURIComponent(next)}`,
      });

      expect(tryAgainHref(html)).toBe('/dashboard');
    });

    it('ignores a same-origin Referer that normalises to //host (T38 S-01)', async () => {
      const { html } = await checkUnavailable({
        referer: 'https://app.example.test/.//evil.example',
      });

      expect(tryAgainHref(html)).toBe('/dashboard');
    });

    it('ignores a cross-origin Referer', async () => {
      const { html } = await checkUnavailable({
        referer: 'https://evil.example/customers',
      });

      expect(tryAgainHref(html)).toBe('/dashboard');
    });

    it('escapes the link target so it cannot break out of the attribute', async () => {
      const { html } = await checkUnavailable({
        search: `?next=${encodeURIComponent('/customers?q="><script>alert(1)</script>')}`,
      });

      const href = tryAgainHref(html);
      expect(href).not.toBeNull();
      expect(href).toMatch(/^\/customers\?q=/);
      expect(href).not.toMatch(/[<>"]/);
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('serves the same page for a null session while a session cookie is present', async () => {
      authMock.mockResolvedValue(null);

      const res = await GET(
        buildRequest(LIVE_COOKIE, { search: '?next=%2Fproducts' })
      );

      expect(res.status).toBe(503);
      expect(res.headers.get('content-type')).toMatch(/^text\/html/i);
      expect(tryAgainHref(await res.text())).toBe('/products');
      expect(res.headers.getSetCookie()).toEqual([]);
    });
  });
});

