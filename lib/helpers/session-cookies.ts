import type { NextRequest, NextResponse } from 'next/server';

// next-auth's session cookie, by name on http and on https.
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token'] as const;

// Browsers ignore a Set-Cookie for a `__Secure-` name that lacks the Secure attribute, so the
// deletion must carry it or the production (https) cookie would survive.
function expireCookie(response: NextResponse, name: string) {
  response.cookies.set(name, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: name.startsWith('__Secure-'),
  });
}

/**
 * Expires every next-auth session cookie on `response`, including the chunked `.0`/`.1`…
 * variants next-auth uses for large JWTs that are present on `request`. No server-only imports,
 * so the proxy can use it too.
 */
export function clearSessionCookies(request: NextRequest, response: NextResponse) {
  for (const name of SESSION_COOKIE_NAMES) {
    expireCookie(response, name);
  }

  for (const cookie of request.cookies.getAll()) {
    const isChunk = SESSION_COOKIE_NAMES.some((base) => cookie.name.startsWith(`${base}.`));
    if (isChunk) {
      expireCookie(response, cookie.name);
    }
  }
}
