// T40/T44 (review-2026-10-03-rereview-2 S-04, rereview-3 T-01, AC-04): Auth.js's GET session sends
// `sessionStore.clean()` (an empty-valued session cookie) when it cannot decode the token or the
// session callback throws. A direct top-level visit, including a crafted link, would end the
// session while the check is failing, and the proxy never sees a route handler's response. The
// route therefore strips session-cookie expiry from every GET, the same way proxy.ts does.
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const upstream = vi.fn<(req: NextRequest) => Promise<Response>>();
const upstreamPost = vi.fn<(req: NextRequest) => Promise<Response>>();
vi.mock('@/auth', () => ({
  handlers: {
    GET: (req: NextRequest) => upstream(req),
    POST: (req: NextRequest) => upstreamPost(req),
  },
}));

import { GET, POST } from '@/app/api/auth/[...nextauth]/route';

const request = (path: string, method = 'GET') =>
  new NextRequest(`https://app.example.test${path}`, { method });

function respondWith(...setCookies: string[]) {
  upstream.mockImplementation(async () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    for (const line of setCookies) headers.append('set-cookie', line);
    return new Response('null', { headers });
  });
}

describe('GET /api/auth/session (AC-04, S-04)', () => {
  it('never lets a failed check clear the session cookie', async () => {
    respondWith(
      'authjs.session-token=; Max-Age=0; Path=/; HttpOnly',
      '__Secure-authjs.session-token.0=; Max-Age=0; Path=/; Secure'
    );
    const response = await GET(request('/api/auth/session'));
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.text()).toBe('null');
  });

  it('keeps a refreshed (non-empty) session cookie and unrelated cookies', async () => {
    respondWith(
      'authjs.session-token=abc; Path=/; HttpOnly',
      'authjs.csrf-token=; Max-Age=0; Path=/'
    );
    const response = await GET(request('/api/auth/session'));
    expect(response.headers.getSetCookie()).toEqual([
      'authjs.session-token=abc; Path=/; HttpOnly',
      'authjs.csrf-token=; Max-Age=0; Path=/',
    ]);
  });

  it('keeps unrelated Set-Cookie lines on other Auth.js GET endpoints', async () => {
    respondWith('authjs.csrf-token=xyz; Path=/; HttpOnly');
    const response = await GET(request('/api/auth/csrf'));
    expect(response.headers.getSetCookie()).toEqual([
      'authjs.csrf-token=xyz; Path=/; HttpOnly',
    ]);
  });
});

// T44 (review-2026-10-03-rereview-3 T-01, AC-04): Auth.js parses the action with
// `split('/').filter(Boolean)` (@auth/core lib/utils/web.js:96), so `//session` and `session/`
// reach the same session action. The strip must cover every GET, not one exact pathname.
describe('GET on any Auth.js path (AC-04, T-01)', () => {
  // An undecodable token: `actions/session.js` pushes `sessionStore.clean()` for every chunk.
  const undecodableToken = [
    '__Secure-authjs.session-token=; Max-Age=0; Path=/; Secure; HttpOnly',
    '__Secure-authjs.session-token.1=; Max-Age=0; Path=/; Secure; HttpOnly',
  ];
  // A throwing session callback: the same clean() on the plain cookie name.
  const throwingSessionCallback = [
    'authjs.session-token=; Max-Age=0; Path=/; HttpOnly',
  ];

  it.each([
    ['/api/auth//session', 'an undecodable token', undecodableToken],
    ['/api/auth/session/', 'an undecodable token', undecodableToken],
    [
      '/api/auth//session',
      'a throwing session callback',
      throwingSessionCallback,
    ],
    [
      '/api/auth/session/',
      'a throwing session callback',
      throwingSessionCallback,
    ],
  ])('%s with %s keeps the session cookie', async (path, _case, lines) => {
    respondWith(...lines);
    const response = await GET(request(path));
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.text()).toBe('null');
  });
});

describe('POST /api/auth/signout (AC-04)', () => {
  it('still clears the session cookie', async () => {
    const cleared = 'authjs.session-token=; Max-Age=0; Path=/; HttpOnly';
    upstreamPost.mockImplementation(async () => {
      const headers = new Headers({ location: 'https://app.example.test/' });
      headers.append('set-cookie', cleared);
      return new Response(null, { status: 302, headers });
    });
    const response = await POST(request('/api/auth/signout', 'POST'));
    expect(upstreamPost).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()).toEqual([cleared]);
  });
});
