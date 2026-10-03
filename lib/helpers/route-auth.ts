// Shared route-handler auth guard (T05 checklist, ADR-0001 "Shape", sad.md §8 Authorization).
//
// Every `app/api/*/route.ts` (except next-auth's own handler) calls `requireSession()` first,
// before any input is parsed. It re-checks the `User` row so a session token for a deleted
// account fails closed (AC-02 fail-closed edge case) rather than trusting the JWT alone.

import { NextResponse } from 'next/server';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { CLEAR_SESSION_PATH } from '@/config/routes.config';
import { isVerifiedSession } from '@/lib/helpers/verified-session';
import { redactError } from '@/lib/helpers/prisma-error-scrub';

/**
 * Why a caller is not a live user (T21, review-2026-10-03 F-01, AC-04):
 * - `signed-out`: `auth()` resolved no session at all. Note @auth/core also resolves null when
 *   the token can't be decoded or the session callback's lookup throws, so this alone does not
 *   prove the session is dead.
 * - `account-gone`: the session decoded, but there is definitively no live account behind it
 *   (AC-21). The only outcome that may end the session.
 * - `check-failed`: the check itself threw. Never ends the session.
 */
export type SessionFailureReason =
  | 'signed-out'
  | 'account-gone'
  | 'check-failed';

export type RequireSessionResult =
  | { ok: true; userId: string }
  | { ok: false; reason: SessionFailureReason; response: NextResponse };

const NOT_SIGNED_IN_BODY = {
  success: false,
  code: 'UNAUTHORIZED',
  error: 'Not signed in.',
} as const;

// Re-exported for existing importers; the path lives in routes.config so client-safe code
// (e.g. unwrapPageResult) can use it without importing Prisma.
export { CLEAR_SESSION_PATH };

function refused(reason: SessionFailureReason): RequireSessionResult {
  return {
    ok: false,
    reason,
    response: NextResponse.json(NOT_SIGNED_IN_BODY, { status: 401 }),
  };
}

/**
 * Resolves the live caller for a route handler, or a ready-to-return 401 `NotSignedIn`
 * response (ADR-0002/openapi.yaml `#/components/responses/NotSignedIn`).
 */
export async function requireSession(): Promise<RequireSessionResult> {
  let session: Session | null;

  try {
    session = await auth();
  } catch (error) {
    unstable_rethrow(error);
    // Fail closed: a thrown auth() call is refused like no session, never as a live user (T09
    // edge case table), but reported as a failed check so the session is kept (AC-04).
    console.error(
      '[requireSession] auth() failed, treating as no session:',
      redactError(error)
    );
    return refused('check-failed');
  }

  if (!isVerifiedSession(session)) {
    // A decoded session without an id is the session callback's "no live account" (AC-21).
    return refused(session?.user ? 'account-gone' : 'signed-out');
  }

  let user: { id: string } | null;
  try {
    // Lazy: keeps the no-session path importable without DATABASE_URL (prisma.ts throws at import).
    const { prisma } = await import('@/prisma');
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
  } catch (error) {
    console.error(
      '[requireSession] account lookup failed, treating as no session:',
      redactError(error)
    );
    return refused('check-failed');
  }

  return user ? { ok: true, userId: user.id } : refused('account-gone');
}

export type LiveUser = { userId: string };

/**
 * Server-only guard for the `(protected)` and `(invoice-editor)` layouts (ADR-0002, AC-21). A
 * session whose `User` row is gone, no session at all, or a thrown `auth()` call (fail closed) is
 * redirected to the cookie-clearing route rather than rendering any data. That route re-checks and
 * decides: it clears cookies only for a definitively missing account, and answers 503 with the
 * cookies kept when its own check fails too, so a failed check never ends an existing session
 * (T21, AC-04). The redirect, not a thrown error, is deliberate: a segment's error.tsx never
 * catches its own layout's error, so an error here would only reach app/global-error.tsx.
 */
export async function requireLiveUser(): Promise<LiveUser> {
  let userId: string | undefined;

  try {
    const session = await auth();
    userId = isVerifiedSession(session) ? session.user.id : undefined;
  } catch (error) {
    // Next's own control-flow errors (dynamic-rendering bail-out, redirects) must propagate.
    unstable_rethrow(error);
    console.error(
      '[requireLiveUser] auth() failed, treating as no session:',
      redactError(error)
    );
    userId = undefined;
  }

  if (!userId) {
    redirect(CLEAR_SESSION_PATH);
  }

  return { userId };
}
