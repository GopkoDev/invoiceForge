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
// This route's own path is explicitly listed on the public allowlist (config/routes.config.ts
// `isPublicPath`), so both a signed-in caller (proxy.ts's "logged in" branch falls through to
// `NextResponse.next()` for a path that is none of protected/legal/auth-page/public) and a
// signed-out caller reach it.
//
// F-28: being public also means a cross-site GET (an <img>, a bare link, no CSRF token
// possible on a plain navigation) can drive any visitor's browser here directly, not only
// `requireLiveUser()`'s own redirect. A caller with a live session is left alone and sent back
// to the dashboard instead.
//
// T21 (review-2026-10-03 F-01, AC-04: "a failed check never ends an existing session"): cookies
// are cleared ONLY when the session definitively has no live account (`account-gone`). A failed
// check, including a null session while a session cookie is present (@auth/core resolves null
// both for a throwing session-callback lookup and for an undecodable token), answers 503 with no
// Set-Cookie, so the same cookie works again once the check recovers. Redirecting to sign-in
// there would loop: the proxy still sees a decodable session and sends /login back here.
import { NextRequest, NextResponse } from 'next/server';
import { authRoutes, protectedRoutes } from '@/config/routes.config';
import {
  clearSessionCookies,
  hasSessionCookie,
} from '@/lib/helpers/session-cookies';
import { requireSession } from '@/lib/helpers/route-auth';

const CHECK_FAILED_BODY =
  'The sign-in check is temporarily unavailable. You are still signed in; please try again in a moment.';

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session.ok) {
    return NextResponse.redirect(
      new URL(protectedRoutes.dashboard, req.url),
      302
    );
  }

  const checkFailed =
    session.reason === 'check-failed' ||
    (session.reason === 'signed-out' && hasSessionCookie(req));
  if (checkFailed) {
    return new NextResponse(CHECK_FAILED_BODY, {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '5',
      },
    });
  }

  const response = NextResponse.redirect(
    new URL(authRoutes.signIn, req.url),
    302
  );
  if (session.reason === 'account-gone') {
    clearSessionCookies(req, response);
  }
  return response;
}
