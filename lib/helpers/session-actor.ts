import 'server-only';
import { NextResponse } from 'next/server';
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

const defaultFailureResponse = () =>
  NextResponse.json({ success: false, code: 'FAILED', error: 'Something went wrong. Please try again.' }, { status: 500 });

/**
 * For route handlers: the unchanged requireSession() 401 response, or the ActingFreelancer. When the
 * time-zone lookup fails the error is reported once and the route's own documented failure response
 * (`failureResponse`) is returned, so each route keeps its own body.
 */
export async function actingFreelancerForRoute(
  failureResponse: () => NextResponse = defaultFailureResponse,
): Promise<{ ok: true; actor: ActingFreelancer } | { ok: false; response: NextResponse }> {
  const { requireSession } = await import('@/lib/helpers/route-auth');
  const session = await requireSession();
  if (!session.ok) return session;
  try {
    return { ok: true, actor: await createActingFreelancer(session.userId, await getRequestTimeZone()) };
  } catch (error) {
    failed('Error resolving the acting freelancer:', error, 'Something went wrong. Please try again.');
    return { ok: false, response: failureResponse() };
  }
}
