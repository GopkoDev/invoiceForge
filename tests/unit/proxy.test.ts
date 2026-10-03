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

import { REQUEST_PATH_HEADER } from '@/config/routes.config';

const BASE = 'https://app.example.test';

function buildRequest(
  path: string,
  options: {
    token?: unknown;
    method?: string;
    headers?: Record<string, string>;
  } = {}
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
  it.each([
    '/',
    '/login',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.json',
    '/opengraph-image',
  ])('lets the public path %s through untouched', async (path) => {
    const res = await callProxy(buildRequest(path));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

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

  it('treats a throwing check as a Visitor and never clears session cookies (AC-04)', async () => {
    const res = await callProxy(
      buildRequest('/dashboard', { token: 'reject' })
    );

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const redirectUrl = new URL(res.headers.get('location') as string);
    expect(redirectUrl.pathname).toBe('/login');
    expect(redirectUrl.searchParams.get('callbackUrl')).toBe('/dashboard');
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

// AC-04 / AC-06: "signed in" means a verified session (`user.id` non-empty string), nothing else.
describe('proxy (AC-04 / AC-06, verified session predicate)', () => {
  const unverified: Array<[string, unknown]> = [
    ['empty object', {}],
    ['user without id', { user: {} }],
    ['empty id', { user: { id: '' } }],
    [
      'Auth.js error object',
      { message: 'There was a problem with the server configuration.' },
    ],
    ['non-session truthy string', 'error'],
  ];

  it.each(unverified)(
    'treats %s as a Visitor on a private page',
    async (_n, token) => {
      const res = await callProxy(buildRequest('/dashboard', { token }));

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const redirectUrl = new URL(res.headers.get('location') as string);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('callbackUrl')).toBe('/dashboard');
    }
  );

  it.each(unverified)(
    'treats %s as a Visitor on /api/*: 401, no data',
    async (_n, token) => {
      const res = await callProxy(
        buildRequest('/api/user/export', { token, method: 'POST' })
      );

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Not signed in.',
      });
    }
  );

  it.each(unverified)(
    'renders public /login and / for %s without a redirect (AC-06)',
    async (_n, token) => {
      for (const path of ['/login', '/']) {
        const res = await callProxy(buildRequest(path, { token }));
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    }
  );

  it.each(['/login', '/', '/api/auth/session'])(
    'renders public %s when the check throws, no cookie clearing',
    async (path) => {
      const res = await callProxy(buildRequest(path, { token: 'reject' }));

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.getSetCookie()).toEqual([]);
    }
  );

  it('answers /api/* with 401 when the check throws, no cookie clearing', async () => {
    const res = await callProxy(
      buildRequest('/api/user/export', { token: 'reject', method: 'POST' })
    );

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  // T32 (R-04): layouts can't see the pathname, so the proxy forwards it on a request header for
  // requireLiveUser()'s "Try again" target; a caller-supplied value is always overwritten.
  it.each(['/dashboard', '/invoices/inv_1/edit?tab=items'])(
    'forwards the requested path %s to a verified private page on a request header',
    async (path) => {
      const res = await callProxy(
        buildRequest(path, {
          token: { user: { id: 'u1' } },
          headers: { [REQUEST_PATH_HEADER]: '//evil.example' },
        })
      );

      expect(res.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe(
        path
      );
    }
  );

  it('lets a verified session through to a private page', async () => {
    const res = await callProxy(
      buildRequest('/dashboard', { token: { user: { id: 'u1' } } })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('proxy method rule (AC-18 / AC-19, refuse anonymous non-GET)', () => {
  const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
  const JSON_H = { 'content-type': 'application/json' };

  async function expectRefused(res: Response) {
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not signed in.',
    });
  }

  it.each(['/', '/privacy', '/terms'])(
    'refuses a POST to the public page %s, with or without Next-Action, form or JSON',
    async (path) => {
      const shapes: Record<string, string>[] = [
        {},
        { 'next-action': 'abc123' },
        FORM,
        { ...FORM, 'next-action': 'abc123' },
        JSON_H,
        { ...JSON_H, 'next-action': 'abc123' },
      ];
      for (const headers of shapes) {
        await expectRefused(
          await callProxy(buildRequest(path, { method: 'POST', headers }))
        );
      }
    }
  );

  it.each(['PUT', 'DELETE', 'PATCH'])(
    'refuses an anonymous %s to a public page',
    async (method) => {
      await expectRefused(await callProxy(buildRequest('/', { method })));
    }
  );

  it('refuses a header-less form POST to a public static asset path', async () => {
    await expectRefused(
      await callProxy(
        buildRequest('/robots.txt', { method: 'POST', headers: FORM })
      )
    );
  });

  it('passes a POST to the sign-in service through', async () => {
    const res = await callProxy(
      buildRequest('/api/auth/signin/nodemailer', {
        method: 'POST',
        headers: FORM,
      })
    );
    expect(res.status).toBe(200);
  });

  it('passes a POST to /login through (sign-in actions, AC-19)', async () => {
    const res = await callProxy(
      buildRequest('/login', {
        method: 'POST',
        headers: { 'next-action': 'abc123' },
      })
    );
    expect(res.status).toBe(200);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'does not apply the method rule to %s on a public page',
    async (method) => {
      const res = await callProxy(buildRequest('/', { method }));
      expect(res.status).toBe(200);
    }
  );

  it('leaves a signed-in POST unaffected', async () => {
    const res = await callProxy(
      buildRequest('/dashboard', {
        method: 'POST',
        token: { user: { id: 'u1' } },
      })
    );
    expect(res.status).toBe(200);
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
