// T40 (review-2026-10-03-rereview-2 S-04, AC-04): Auth.js's own GET /api/auth/session sends
// `sessionStore.clean()` (an empty-valued session cookie) when it cannot decode the token or the
// session callback throws. A direct top-level visit, including a crafted link, would end the
// session while the check is failing, and the proxy never sees a route handler's response. The
// route therefore strips session-cookie expiry from that GET, the same way proxy.ts does.
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const upstream = vi.fn<(req: NextRequest) => Promise<Response>>();
vi.mock('@/auth', () => ({
  handlers: { GET: (req: NextRequest) => upstream(req), POST: vi.fn() },
}));

import { GET } from '@/app/api/auth/[...nextauth]/route';

const request = (path: string) =>
  new NextRequest(`https://app.example.test${path}`);

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

  it('leaves other Auth.js GET endpoints alone', async () => {
    respondWith('authjs.session-token=; Max-Age=0; Path=/');
    const response = await GET(request('/api/auth/signout'));
    expect(response.headers.getSetCookie()).toEqual([
      'authjs.session-token=; Max-Age=0; Path=/',
    ]);
  });
});
