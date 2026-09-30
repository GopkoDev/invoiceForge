// Mints a next-auth v5 JWT session cookie for a seeded Freelancer (test-plan.md §Test data:
// "Freelancer (user + a session token usable as a cookie)"). auth.ts configures
// `session.strategy: 'jwt'`, so there is no Session row to seed - the cookie is a self-contained
// encrypted JWT, verified by the same AUTH_SECRET the app uses. Cookie name matches the
// contract (openapi.yaml SessionCookie): unprefixed `authjs.session-token` on http, `__Secure-`
// prefixed on https - AUTH_URL is http://localhost in dev/test, so this always mints the
// unprefixed name.

import { encode } from 'next-auth/jwt';

const SESSION_COOKIE_NAME = 'authjs.session-token';
const SESSION_COOKIE_SALT = SESSION_COOKIE_NAME;
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export interface SessionCookie {
  name: string;
  value: string;
}

export interface SessionSubject {
  id: string;
  name?: string | null;
  email: string;
}

export async function createSessionCookie(user: SessionSubject): Promise<SessionCookie> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET is not set in the test environment; cannot mint a session cookie.'
    );
  }

  const value = await encode({
    token: {
      sub: user.id,
      id: user.id,
      name: user.name ?? undefined,
      email: user.email,
    },
    secret,
    salt: SESSION_COOKIE_SALT,
    maxAge: THIRTY_DAYS_SECONDS,
  });

  return { name: SESSION_COOKIE_NAME, value };
}

/** `Cookie:` header value for HTTP-client-style requests. */
export function toCookieHeader(cookie: SessionCookie): string {
  return `${cookie.name}=${cookie.value}`;
}
