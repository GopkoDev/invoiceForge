// Shared route-handler auth guard (T05 checklist, ADR-0001 "Shape", sad.md §8 Authorization).
//
// Every `app/api/*/route.ts` (except next-auth's own handler) calls `requireSession()` first,
// before any input is parsed. It re-checks the `User` row so a session token for a deleted
// account fails closed (AC-02 fail-closed edge case) rather than trusting the JWT alone.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/prisma';

export type RequireSessionResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

const NOT_SIGNED_IN_BODY = { success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' } as const;

/**
 * Resolves the live caller for a route handler, or a ready-to-return 401 `NotSignedIn`
 * response (ADR-0002/openapi.yaml `#/components/responses/NotSignedIn`).
 */
export async function requireSession(): Promise<RequireSessionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, response: NextResponse.json(NOT_SIGNED_IN_BODY, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return { ok: false, response: NextResponse.json(NOT_SIGNED_IN_BODY, { status: 401 }) };
  }

  return { ok: true, userId: user.id };
}
