import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import authConfig from '@/auth.config';
import {
  authRoutes,
  routes,
  protectedRoutes,
  isPublicPath,
} from './config/routes.config';

const { auth } = NextAuth(authConfig);

export default auth(async function proxy(req) {
  try {
    const token = await req.auth;
    const { pathname } = req.nextUrl;

    const isAuthPage = routes.auth.some((route) => pathname.startsWith(route));
    const isPublicRoute = routes.public.some((route) => pathname === route);
    const isProtectedRoute = routes.protected.some((route) =>
      pathname.startsWith(route)
    );
    const isLegalRoute = routes.legal.some((route) => pathname === route);

    // === LOGGED IN USER ===
    if (token) {
      if (isProtectedRoute || isLegalRoute) {
        return NextResponse.next();
      }

      if (isAuthPage) {
        return NextResponse.redirect(
          new URL(protectedRoutes.dashboard, req.url)
        );
      }

      if (isPublicRoute) {
        return NextResponse.redirect(
          new URL(protectedRoutes.dashboard, req.url)
        );
      }

      return NextResponse.next();
    }

    // === NOT LOGGED IN USER (AC-05: deny by default) ===
    // Deliberately public: sign-in/sign-up, landing, legal pages, crawling/share/icon
    // assets and the next-auth handler itself. Everything else — including paths added
    // later — is private.
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
  } catch (error) {
    console.error('[proxy] Auth error:', error);
    const response = NextResponse.redirect(new URL(authRoutes.signIn, req.url));

    response.cookies.delete('authjs.session-token');
    response.cookies.delete('__Secure-authjs.session-token');

    return response;
  }
});

export const config = {
  matcher: [
    // Deny by default (ADR-0001): every path is covered, including /api, except the
    // framework/infra paths below, which carry no app data and are excluded so this
    // security-critical matcher stays a short, fully-commented allowlist of exclusions:
    //   - _next/static — Next.js build assets, immutable and served by the framework
    //   - _next/image  — the Next.js image optimizer, not an app route
    //   - monitoring   — the Sentry tunnel, forwards telemetry only
    '/((?!_next/static|_next/image|monitoring).*)',
  ],
};
