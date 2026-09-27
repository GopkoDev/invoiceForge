// Shared route-handler auth guard (T05 checklist, ADR-0001 "Shape", sad.md §8 Authorization).
//
// Every `app/api/*/route.ts` (except next-auth's own handler) calls `requireSession()` first,
// before any input is parsed. It re-checks the `User` row so a session token for a deleted
// account fails closed (AC-02 fail-closed edge case) rather than trusting the JWT alone.

import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/prisma';

export type RequireSessionResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

const NOT_SIGNED_IN_BODY = { success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' } as const;

// T09 (ADR-0002): a layout is a server component and can't write cookies itself, so the
// live-account guard redirects here (a route handler, which can) rather than calling
// `signOut()` directly. Named so both call sites (this file and the redirect target itself)
// agree on the path.
export const CLEAR_SESSION_PATH = '/api/auth/clear-session';

/**
 * Resolves the live caller for a route handler, or a ready-to-return 401 `NotSignedIn`
 * response (ADR-0002/openapi.yaml `#/components/responses/NotSignedIn`).
 */
export async function requireSession(): Promise<RequireSessionResult> {
  let userId: string | undefined;

  try {
    const session = await auth();
    userId = session?.user?.id;
  } catch (error) {
    // Fail closed: a thrown auth() call (e.g. the session callback's DB lookup is down) is
    // treated as no session, never as a live user (T09 edge case table).
    console.error('[requireSession] auth() failed, treating as no session:', error);
    return { ok: false, response: NextResponse.json(NOT_SIGNED_IN_BODY, { status: 401 }) };
  }

  if (!userId) {
    return { ok: false, response: NextResponse.json(NOT_SIGNED_IN_BODY, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return { ok: false, response: NextResponse.json(NOT_SIGNED_IN_BODY, { status: 401 }) };
  }

  return { ok: true, userId: user.id };
}

export type LiveUser = { userId: string };

/**
 * Server-only guard for the `(protected)` and `(invoice-editor)` layouts (ADR-0002, AC-21). A
 * session whose `User` row is gone (or whose `auth()` call throws — Session callback throws ⇒
 * fail closed, per the task's edge case table) is treated exactly like no session: redirected to
 * the cookie-clearing route rather than rendering any data.
 */
export async function requireLiveUser(): Promise<LiveUser> {
  let userId: string | undefined;

  try {
    const session = await auth();
    userId = session?.user?.id;
  } catch (error) {
    console.error('[requireLiveUser] auth() failed, treating as no session:', error);
    userId = undefined;
  }

  if (!userId) {
    redirect(CLEAR_SESSION_PATH);
  }

  return { userId };
}
