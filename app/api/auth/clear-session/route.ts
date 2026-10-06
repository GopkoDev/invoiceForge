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
// AC-04 (a failed check never ends an existing session): cookies
// are cleared ONLY when the session definitively has no live account (`account-gone`). A failed
// check, including a null session while a session cookie is present (@auth/core resolves null
// both for a throwing session-callback lookup and for an undecodable token), answers 503 with no
// Set-Cookie, so the same cookie works again once the check recovers. Redirecting to sign-in
// there would loop: the proxy still sees a decodable session and sends /login back here.
//
// That 503 is a self-contained HTML page (a route handler can't render the LoadError component:
// inline styles mirroring its tokens, no script) with a "Try again" link to `?next=` or a
// same-origin Referer, reduced by safeReturnPath() so the link is never an open redirect.
import { NextRequest, NextResponse } from 'next/server';
import { authRoutes, protectedRoutes } from '@/config/routes.config';
import {
  clearSessionCookies,
  hasSessionCookie,
} from '@/lib/helpers/session-cookies';
import { requireSession } from '@/lib/helpers/route-auth';
import { safeReturnPath } from '@/lib/helpers/return-path';

const RETRY_AFTER_SECONDS = 5;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tryAgainPath(req: NextRequest): string {
  const origin = req.nextUrl.origin;
  return (
    safeReturnPath(req.nextUrl.searchParams.get('next'), origin) ??
    safeReturnPath(req.headers.get('referer'), origin, {
      allowAbsoluteSameOrigin: true,
    }) ??
    protectedRoutes.dashboard
  );
}

// Copy reuses LoadError's title, description and button label, plus the one fact this state adds:
// the session was kept.
function checkUnavailablePage(tryAgainHref: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>We couldn&#39;t load your data</title>
<style>
:root{color-scheme:light dark;--background:oklch(1 0 0);--foreground:oklch(0.145 0 0);--muted:oklch(0.97 0 0);--muted-foreground:oklch(0.556 0 0);--primary:oklch(0.205 0 0);--primary-foreground:oklch(0.985 0 0)}
@media (prefers-color-scheme:dark){:root{--background:oklch(0.145 0 0);--foreground:oklch(0.985 0 0);--muted:oklch(0.269 0 0);--muted-foreground:oklch(0.708 0 0);--primary:oklch(0.87 0 0);--primary-foreground:oklch(0.205 0 0)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--background);color:var(--foreground);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{display:flex;flex-direction:column;align-items:center;gap:24px;max-width:24rem;text-align:center}
.icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;margin:0 auto;border-radius:8px;background:var(--muted)}
h1{margin:16px 0 0;font-size:1.125rem;font-weight:500;letter-spacing:-0.01em}
p{margin:8px 0 0;font-size:.875rem;line-height:1.5;color:var(--muted-foreground)}
a{display:inline-flex;align-items:center;height:36px;padding:0 16px;border-radius:6px;background:var(--primary);color:var(--primary-foreground);font-size:.875rem;font-weight:500;text-decoration:none}
a:focus-visible{outline:3px solid var(--muted-foreground);outline-offset:2px}
</style>
</head>
<body>
<main>
<div>
<div class="icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div>
<h1>We couldn&#39;t load your data</h1>
<p>Something went wrong on our side. Your data is safe and you are still signed in. Try again.</p>
</div>
<a href="${escapeHtml(tryAgainHref)}">Try again</a>
</main>
</body>
</html>
`;
}

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
    return new NextResponse(checkUnavailablePage(tryAgainPath(req)), {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(RETRY_AFTER_SECONDS),
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
