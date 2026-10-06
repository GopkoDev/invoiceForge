// AC-05: contract test of isVerifiedSession
// against REAL Auth.js output. A session cookie is minted with next-auth's own JWT encoder and sent
// through the real `NextAuth(authConfig).auth(handler)` wrapper, the exact path proxy.ts uses
// (cookie -> @auth/core session action -> edge session callback -> next-auth's `{ user, ...session }`
// rebuild -> `req.auth`). Nothing is mocked, so a `req.auth` shape change in a later beta fails here.
import { register } from 'node:module';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import authConfig from '@/auth.config';
import { isVerifiedSession } from '@/lib/helpers/verified-session';

const SECRET = 'contract-test-secret-at-least-32-characters-long';
// Production runs on https, where Auth.js names the session cookie `__Secure-authjs.session-token`;
// the cookie name is also the JWT salt.
const COOKIE = '__Secure-authjs.session-token';
const BASE = 'https://app.example.test';

// next-auth imports `next/server`, `next/headers`, `next/navigation` without an extension, which
// Node's native ESM resolver (vitest externalizes node_modules) rejects; Next's bundler normally
// papers over this. Map extensionless `next/<entry>` to its `.js` file, then load the REAL next-auth.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function resolve(s, c, n) {' +
        ' if (/^next\\/[a-z-]+$/.test(s)) return n(s + ".js", c);' +
        ' return n(s, c); }'
    )
);
const { default: NextAuth } = await import('next-auth');
const { auth } = NextAuth({ ...authConfig, secret: SECRET, trustHost: true });

type Wrapped = (req: NextRequest, ctx: unknown) => Promise<Response>;

async function mintCookie(
  token: Record<string, unknown>,
  secret = SECRET
): Promise<string> {
  return `${COOKIE}=${await encode({ token, secret, salt: COOKIE })}`;
}

// Runs a request through the real next-auth wrapper and returns the `req.auth` it hands the proxy.
async function reqAuthFor(cookie: string | null): Promise<unknown> {
  const headers = new Headers({ 'x-forwarded-proto': 'https' });
  if (cookie) headers.set('cookie', cookie);
  const request = new NextRequest(new URL('/dashboard', BASE), { headers });

  let seen: unknown = 'handler-not-called';
  const wrapped = auth((req) => {
    seen = req.auth;
    return new Response(null, { status: 204 });
  }) as unknown as Wrapped;
  await wrapped(request, { params: Promise.resolve({}) });
  expect(seen).not.toBe('handler-not-called');
  return seen;
}

describe('isVerifiedSession against real Auth.js req.auth (AC-05)', () => {
  it('a genuine JWT carrying the account id (as the jwt callback sets it) is a verified session', async () => {
    const session = await reqAuthFor(
      await mintCookie({ id: 'u1', sub: 'u1', email: 'a@b.test' })
    );
    expect(session).toMatchObject({ user: { id: 'u1' } });
    expect(isVerifiedSession(session)).toBe(true);
  });

  it('a validly signed JWT without an account id is a Visitor', async () => {
    const session = await reqAuthFor(
      await mintCookie({ sub: 'u1', email: 'a@b.test' })
    );
    expect(isVerifiedSession(session)).toBe(false);
  });

  it('no session cookie is a Visitor', async () => {
    expect(isVerifiedSession(await reqAuthFor(null))).toBe(false);
  });

  it('a JWT signed with a different secret is a Visitor', async () => {
    const cookie = await mintCookie(
      { id: 'u1', sub: 'u1' },
      'another-secret-also-32-characters-long!!'
    );
    expect(isVerifiedSession(await reqAuthFor(cookie))).toBe(false);
  });
});

// AC-04: when the edge cannot decode the session JWT (a wrong or
// rotated AUTH_SECRET), next-auth's wrapper appends `sessionStore.clean()` cookie expiries to
// whatever the proxy returns. proxy.ts is driven here through the REAL wrapper (the unit test in
// tests/unit/proxy.test.ts stubs it, so it cannot see these cookies).
describe('proxy.ts keeps the session cookies when the edge check fails (AC-04, F-02)', async () => {
  process.env.AUTH_SECRET = SECRET;
  process.env.AUTH_TRUST_HOST = 'true';
  const { default: proxy } = (await import('@/proxy')) as unknown as {
    default: Wrapped;
  };
  const WRONG_SECRET = 'another-secret-also-32-characters-long!!';

  function request(path: string, cookie: string): NextRequest {
    return new NextRequest(new URL(path, BASE), {
      headers: { 'x-forwarded-proto': 'https', cookie },
    });
  }

  function sessionCookieExpiries(res: Response): string[] {
    return res.headers
      .getSetCookie()
      .filter((c) => /^(__Secure-)?authjs\.session-token(\.\d+)?=;/.test(c));
  }

  it('the raw wrapper does expire an undecodable session cookie (so the proxy must strip it)', async () => {
    const wrapped = auth(() => undefined) as unknown as Wrapped;
    const res = await wrapped(
      request('/', await mintCookie({ id: 'u1', sub: 'u1' }, WRONG_SECRET)),
      { params: Promise.resolve({}) }
    );
    expect(sessionCookieExpiries(res)).not.toEqual([]);
  });

  it.each(['/dashboard', '/login', '/', '/api/user/export'])(
    'an undecodable session cookie on %s is left untouched',
    async (path) => {
      const cookie = await mintCookie({ id: 'u1', sub: 'u1' }, WRONG_SECRET);
      const res = await proxy(request(path, `${cookie}; ${COOKIE}.0=chunk`), {
        params: Promise.resolve({}),
      });
      expect(sessionCookieExpiries(res)).toEqual([]);
    }
  );

  it('a genuine session still has its expiry refreshed through the proxy', async () => {
    const res = await proxy(
      request('/dashboard', await mintCookie({ id: 'u1', sub: 'u1' })),
      { params: Promise.resolve({}) }
    );
    expect(res.headers.get('location')).toBeNull();
    expect(
      res.headers.getSetCookie().some((c) => c.startsWith(`${COOKIE}=ey`))
    ).toBe(true);
  });
});
