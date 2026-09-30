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
// `requireLiveUser()`'s own redirect. Cookies are only cleared when the caller's session is
// actually dead (`requireSession()` fails) — the exact case this route exists for. A caller
// with a live session is left alone and sent back to the dashboard instead.
import { NextRequest, NextResponse } from 'next/server';
import { authRoutes, protectedRoutes } from '@/config/routes.config';
import { clearSessionCookies } from '@/lib/helpers/session-cookies';
import { requireSession } from '@/lib/helpers/route-auth';

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session.ok) {
    return NextResponse.redirect(new URL(protectedRoutes.dashboard, req.url), 302);
  }

  const response = NextResponse.redirect(new URL(authRoutes.signIn, req.url), 302);
  clearSessionCookies(req, response);
  return response;
}
