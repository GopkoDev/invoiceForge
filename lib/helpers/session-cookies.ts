import type { NextRequest, NextResponse } from 'next/server';

// next-auth's session cookie, by name on http and on https.
const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
] as const;

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

/** True for a next-auth session cookie name, chunked (`.0`, `.1`…) or not. */
export function isSessionCookieName(name: string): boolean {
  return SESSION_COOKIE_NAMES.some(
    (base) => name === base || name.startsWith(`${base}.`)
  );
}

/** True when `request` carries any next-auth session cookie (T21). */
export function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => isSessionCookieName(cookie.name));
}

/**
 * Expires every next-auth session cookie on `response`, including the chunked `.0`/`.1`…
 * variants next-auth uses for large JWTs that are present on `request`. No server-only imports,
 * so the proxy can use it too.
 */
export function clearSessionCookies(
  request: NextRequest,
  response: NextResponse
) {
  for (const name of SESSION_COOKIE_NAMES) {
    expireCookie(response, name);
  }

  for (const cookie of request.cookies.getAll()) {
    const isChunk = SESSION_COOKIE_NAMES.some((base) =>
      cookie.name.startsWith(`${base}.`)
    );
    if (isChunk) {
      expireCookie(response, cookie.name);
    }
  }
}

// A Set-Cookie line that expires a session cookie: an empty value, as `sessionStore.clean()` and
// `expireCookie` above both write it.
function isSessionCookieExpiry(setCookie: string): boolean {
  const pair = setCookie.split(';', 1)[0];
  const eq = pair.indexOf('=');
  return (
    eq > 0 &&
    isSessionCookieName(pair.slice(0, eq).trim()) &&
    pair.slice(eq + 1).trim() === ''
  );
}

/**
 * T21 (review-2026-10-03 F-02, AC-04): next-auth's middleware wrapper appends
 * `sessionStore.clean()` expiries for every session cookie it can't decode (a wrong or rotated
 * AUTH_SECRET), on top of whatever the proxy returns. Returns `response` without those lines, so
 * a failed edge check never ends the session; a refreshed (non-empty) session cookie is kept.
 */
export function withoutSessionCookieExpiry(response: Response): Response {
  const setCookies = response.headers.getSetCookie();
  const kept = setCookies.filter((line) => !isSessionCookieExpiry(line));
  if (kept.length === setCookies.length) return response;

  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') headers.append(key, value);
  });
  for (const line of kept) headers.append('set-cookie', line);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
