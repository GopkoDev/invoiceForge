// Shared route-handler auth guard (T05 checklist, ADR-0001 "Shape", sad.md §8 Authorization).
//
// Every `app/api/*/route.ts` (except next-auth's own handler) calls `requireSession()` first,
// before any input is parsed. It re-checks the `User` row so a session token for a deleted
// account fails closed (AC-02 fail-closed edge case) rather than trusting the JWT alone.

import { NextResponse } from 'next/server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/prisma';
import { CLEAR_SESSION_PATH } from '@/config/routes.config';
import { redactError } from '@/lib/helpers/prisma-error-scrub';

export type RequireSessionResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

const NOT_SIGNED_IN_BODY = { success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' } as const;

// Re-exported for existing importers; the path lives in routes.config so client-safe code
// (e.g. unwrapPageResult) can use it without importing Prisma.
export { CLEAR_SESSION_PATH };

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
    unstable_rethrow(error);
    // Fail closed: a thrown auth() call (e.g. the session callback's DB lookup is down) is
    // treated as no session, never as a live user (T09 edge case table).
    console.error('[requireSession] auth() failed, treating as no session:', redactError(error));
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
    // Next's own control-flow errors (dynamic-rendering bail-out, redirects) must propagate.
    unstable_rethrow(error);
    console.error('[requireLiveUser] auth() failed, treating as no session:', redactError(error));
    userId = undefined;
  }

  if (!userId) {
    redirect(CLEAR_SESSION_PATH);
  }

  return { userId };
}
