import { NextResponse, type NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import authConfig from '@/auth.config';
import { isVerifiedSession } from '@/lib/helpers/verified-session';
import { withoutSessionCookieExpiry } from '@/lib/helpers/session-cookies';
import {
  authRoutes,
  routes,
  protectedRoutes,
  isPublicPath,
  isRefusedAnonymousMutation,
  REQUEST_PATH_HEADER,
} from './config/routes.config';

const { auth } = NextAuth(authConfig);

// T32 (R-04, AC-04): a verified request passes on with the requested path on a request header,
// always overwriting a caller-supplied value, for requireLiveUser()'s "Try again" target.
function nextWithRequestPath(req: NextRequest): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    REQUEST_PATH_HEADER,
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

const authProxy = auth(async function proxy(req) {
  // A thrown or malformed check is a Visitor; session cookies are left untouched so a
  // Freelancer is signed in again once the check recovers (AC-04, AC-06).
  let verified = false;
  try {
    verified = isVerifiedSession(await req.auth);
  } catch (error) {
    console.error('[proxy] Auth error:', error);
  }

  const { pathname } = req.nextUrl;

  const isAuthPage = routes.auth.some((route) => pathname.startsWith(route));
  const isPublicRoute = routes.public.some((route) => pathname === route);
  const isProtectedRoute = routes.protected.some((route) =>
    pathname.startsWith(route)
  );
  const isLegalRoute = routes.legal.some((route) => pathname === route);

  // === LOGGED IN USER ===
  if (verified) {
    if (isProtectedRoute || isLegalRoute) {
      return nextWithRequestPath(req);
    }

    if (isAuthPage) {
      return NextResponse.redirect(new URL(protectedRoutes.dashboard, req.url));
    }

    if (isPublicRoute) {
      return NextResponse.redirect(new URL(protectedRoutes.dashboard, req.url));
    }

    return nextWithRequestPath(req);
  }

  // === NOT LOGGED IN USER (AC-05: deny by default) ===
  // Deliberately public: sign-in/sign-up, landing, legal pages, crawling/share/icon
  // assets and the next-auth handler itself. Everything else — including paths added
  // later — is private.
  // ADR-0003 layer 1: the method rule runs before the public-path check, so no shape of
  // request (header-less form post, JSON, any page) can reach an action anonymously.
  if (isRefusedAnonymousMutation(req.method, pathname)) {
    return NextResponse.json(
      { success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' },
      { status: 401 }
    );
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // A data request (any /api/* route) or a server action (Next-Action header POST) is
  // refused with 401 and no body data; the handler behind it never runs (AC-02).
  const isApiRequest = pathname.startsWith('/api/');
  const isServerAction = req.headers.has('Next-Action');

  if (isApiRequest || isServerAction) {
    return NextResponse.json(
      { success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' },
      { status: 401 }
    );
  }

  // Every other page request is private by default: send to sign-in.
  const loginUrl = new URL(authRoutes.signIn, req.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
});

// T21 (review-2026-10-03 F-02, AC-04): the wrapper itself expires a session cookie it can't
// decode; strip that so a failed check never ends the session.
export default async function proxy(
  ...args: Parameters<typeof authProxy>
): Promise<Response> {
  return withoutSessionCookieExpiry(
    (await authProxy(...args)) ?? NextResponse.next()
  );
}

export const config = {
  matcher: [
    // Deny by default (ADR-0001): every path is covered, including /api, except the
    // framework/infra paths below, which carry no app data and are excluded so this
    // security-critical matcher stays a short, fully-commented allowlist of exclusions:
    //   - _next/static — Next.js build assets, immutable and served by the framework
    //   - _next/image  — the Next.js image optimizer, not an app route
    //   - monitoring   — the Sentry tunnel, forwards telemetry only
    // F-27: each exclusion is anchored to a segment boundary (itself or followed by `/`), so
    // a look-alike path such as `/monitoring-x` is not swallowed by the same exclusion and
    // still goes through the proxy.
    '/((?!(?:_next/static|_next/image|monitoring)(?:/|$)).*)',
  ],
};
