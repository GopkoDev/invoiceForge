import 'server-only';
import type { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import { getRequestTimeZone } from '@/lib/helpers/time-zone';
import { createActingFreelancer, type ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { ok, type ActionResult } from '@/types/result';

/** Session + tz cookie -> ActingFreelancer, or UNAUTHORIZED (AC-10). Web layer only. */
export async function actingFreelancerFromSession(): Promise<ActionResult<ActingFreelancer>> {
  const user = await getAuthenticatedUser();
  if (!user.success) return user;
  try {
    return ok(await createActingFreelancer(user.data.userId, await getRequestTimeZone()));
  } catch (error) {
    return failed('Error resolving the acting freelancer:', error, 'Something went wrong. Please try again.');
  }
}

/** For route handlers: the unchanged requireSession() 401 response, or the ActingFreelancer. */
export async function actingFreelancerForRoute(): Promise<
  { ok: true; actor: ActingFreelancer } | { ok: false; response: NextResponse }
> {
  const { requireSession } = await import('@/lib/helpers/route-auth');
  const session = await requireSession();
  if (!session.ok) return session;
  try {
    return { ok: true, actor: await createActingFreelancer(session.userId, await getRequestTimeZone()) };
  } catch (error) {
    // A failed time-zone lookup must not become the framework's default 500: the route works in UTC.
    failed('Error resolving the acting freelancer:', error, 'Something went wrong. Please try again.');
    return { ok: true, actor: await createActingFreelancer(session.userId) };
  }
}
