// AC-02 / AC-05: without a session, every path is denied by default except the deliberately
// public allowlist. A page request is redirected to sign-in with a callbackUrl; an /api/*
// request or a server-action POST (Next-Action header) is refused with 401 NotSignedIn and no
// data. This exercises the proxy's decision logic directly (no HTTP server, no database) by
// stubbing next-auth's `auth()` wrapper as a pass-through and attaching `req.auth` ourselves,
// the way next-auth v5 itself does before invoking the wrapped middleware.
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  default: () => ({
    auth: (handler: (req: NextRequest) => unknown) => handler,
  }),
}));

const BASE = 'https://app.example.test';

function buildRequest(
  path: string,
  options: { token?: unknown; method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const request = new NextRequest(new URL(path, BASE), {
    method: options.method ?? 'GET',
    headers: options.headers,
  });

  // next-auth's real `auth()` wrapper resolves this from the session cookie before calling the
  // wrapped middleware; here we set it directly to drive the "no session" and "malformed
  // session" cases without minting real JWTs.
  Object.defineProperty(request, 'auth', {
    value:
      options.token === 'reject'
        ? Promise.reject(new Error('invalid session token'))
        : Promise.resolve(options.token ?? null),
  });

  return request;
}

async function callProxy(request: NextRequest) {
  const { default: proxy } = await import('@/proxy');
  return (proxy as unknown as (req: NextRequest) => Promise<Response>)(request);
}

describe('proxy (AC-05, deny by default, no session)', () => {
  it.each(['/', '/login', '/robots.txt', '/sitemap.xml', '/manifest.json', '/opengraph-image'])(
    'lets the public path %s through untouched',
    async (path) => {
      const res = await callProxy(buildRequest(path));

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  );

  it('lets the next-auth handler prefix through', async () => {
    const res = await callProxy(buildRequest('/api/auth/session'));

    expect(res.status).toBe(200);
  });

  it.each(['/dashboard', '/invoices/x/edit', '/some-new-path'])(
    'redirects the private page %s to sign-in with a callbackUrl',
    async (path) => {
      const res = await callProxy(buildRequest(path));

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get('location');
      expect(location).not.toBeNull();
      const redirectUrl = new URL(location as string);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('callbackUrl')).toBe(path);
    }
  );

  it.each(['/api/convert-image', '/api/user/export'])(
    'refuses %s with 401 NotSignedIn and no data (AC-02)',
    async (path) => {
      const res = await callProxy(buildRequest(path, { method: 'POST' }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Not signed in.',
      });
    }
  );

  it('refuses a server-action POST (Next-Action header) with 401 NotSignedIn', async () => {
    const res = await callProxy(
      buildRequest('/dashboard', {
        method: 'POST',
        headers: { 'Next-Action': 'abc123' },
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not signed in.',
    });
  });

  it('treats a malformed session token as no session and clears both cookies', async () => {
    const res = await callProxy(buildRequest('/dashboard', { token: 'reject' }));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('authjs.session-token=;');
  });

  it('marks the __Secure- cookie deletion Secure, or browsers on https ignore it', async () => {
    const res = await callProxy(buildRequest('/dashboard', { token: 'reject' }));

    const secureDeletion = res.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('__Secure-authjs.session-token='));
    expect(secureDeletion).toBeDefined();
    expect(secureDeletion).toMatch(/;\s*Secure/i);
    expect(secureDeletion).toMatch(/;\s*Path=\//i);
  });
});

describe('proxy matcher (sad.md §11, api is no longer excluded)', () => {
  it('covers /api paths and still excludes framework/infra paths', async () => {
    const { config } = await import('@/proxy');
    expect(config.matcher).toHaveLength(1);
    // Next.js matches the matcher against the whole pathname, so anchor it the same way.
    const pattern = new RegExp(`^${config.matcher[0] as string}$`);

    expect(pattern.test('/api/convert-image')).toBe(true);
    expect(pattern.test('/_next/static/chunk.js')).toBe(false);
    expect(pattern.test('/_next/image')).toBe(false);
    expect(pattern.test('/monitoring')).toBe(false);
    expect(pattern.test('/monitoring/tunnel')).toBe(false);
  });

  // F-27: the exclusions are unanchored prefixes, so a real app path that merely starts with
  // one of the excluded words (but is not that framework/infra path) must still be proxied.
  it('does not let a look-alike path bypass the proxy (F-27)', async () => {
    const { config } = await import('@/proxy');
    const pattern = new RegExp(`^${config.matcher[0] as string}$`);

    expect(pattern.test('/monitoring-x')).toBe(true);
    expect(pattern.test('/_next/staticfoo')).toBe(true);
    expect(pattern.test('/_next/imagex')).toBe(true);
  });
});
