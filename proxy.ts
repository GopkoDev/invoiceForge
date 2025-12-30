import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import authConfig from '@/auth.config';
import { authRoutes, routes, protectedRoutes } from './config/routes.config';

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

    // === LOGGED IN USER ===
    if (token) {
      if (isProtectedRoute) {
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

    // === NOT LOGGED IN USER ===
    if (!token) {
      if (isProtectedRoute) {
        const loginUrl = new URL(authRoutes.signIn, req.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }

      if (isPublicRoute || isAuthPage) {
        return NextResponse.next();
      }

      return NextResponse.redirect(new URL('/', req.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error('[proxy] Auth error:', error);
    const response = NextResponse.redirect(new URL(authRoutes.signIn, req.url));

    response.cookies.delete('authjs.session-token');
    response.cookies.delete('__Secure-authjs.session-token');

    return response;
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
