// T09 (spec.md §5 AC-21, adr/0002-treat-sessions-without-a-live-account-as-visitors.md) — the
// server-side redirect target for a stale token whose `User` row is gone.
//
// A layout (server component) can't clear cookies itself and `signOut()` writes cookies too, so
// `requireLiveUser()` (lib/helpers/route-auth.ts) redirects here instead of calling `signOut()`
// directly. This route handler clears every next-auth session cookie (including the chunked
// `.0`/`.1`… variants next-auth uses for large JWTs) and 302s to sign-in, so the cookie is gone
// before the browser ever re-requests a protected page — avoiding the sign-in redirect loop a
// stale-but-uncleared cookie would cause in `proxy.ts`.
//
// This path lives under `/api/auth/` and next.js prefers this specific route segment over the
// `[...nextauth]` catch-all, so it is reachable without ever hitting next-auth's own handler.
// `/api/auth/` is already on the public allowlist (config/routes.config.ts `isPublicPath`), so
// both a signed-in caller (proxy.ts's "logged in" branch falls through to `NextResponse.next()`
// for a path that is none of protected/legal/auth-page/public) and a signed-out caller reach it.
import { NextRequest, NextResponse } from 'next/server';
import { authRoutes } from '@/config/routes.config';

// Mirrors the cookie names proxy.ts's catch branch clears on a malformed token.
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

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL(authRoutes.signIn, req.url), 302);

  for (const name of SESSION_COOKIE_NAMES) {
    expireCookie(response, name);
  }

  // Large JWTs get split by next-auth into chunks: authjs.session-token.0, .1, ... Only clear
  // chunk cookies that are actually present on the request.
  for (const cookie of req.cookies.getAll()) {
    const isChunk = SESSION_COOKIE_NAMES.some((base) => cookie.name.startsWith(`${base}.`));
    if (isChunk) {
      expireCookie(response, cookie.name);
    }
  }

  return response;
}
