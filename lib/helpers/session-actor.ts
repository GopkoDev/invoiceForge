import 'server-only';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import { getBrowserTimeZone } from '@/lib/helpers/time-zone';
import { resolveTimeZone } from '@/lib/services/_shared/time-zone';
import {
  actingFreelancerFromPersonalKey,
  type ActingFreelancer,
} from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { ok, type ActionResult } from '@/types/result';

/**
 * Session factory (ADR-0006, flow 12): the zone saved on the account wins and the browser value is
 * ignored; with none saved, a browser zone that resolveTimeZone accepts is saved only while the
 * column is still empty and used; otherwise UTC and nothing is saved.
 */
async function buildSessionActor(userId: string): Promise<ActingFreelancer> {
  // Lazy: loading this module must not require DATABASE_URL (same reason as resolveTimeZone).
  const { getSavedTimeZone, seedTimeZoneIfEmpty } = await import('@/lib/services/profile/profile');
  const saved = await getSavedTimeZone(userId);
  if (saved) return actingFreelancerFromPersonalKey(userId, saved);

  const browser = await getBrowserTimeZone();
  const seed = browser ? await resolveTimeZone(browser) : 'UTC';
  if (seed !== 'UTC') await seedTimeZoneIfEmpty(userId, seed);
  return actingFreelancerFromPersonalKey(userId, seed);
}

/** Session -> ActingFreelancer (zone from the account), or UNAUTHORIZED (AC-10). Web layer only. */
export async function actingFreelancerFromSession(): Promise<ActionResult<ActingFreelancer>> {
  const user = await getAuthenticatedUser();
  if (!user.success) return user;
  try {
    return ok(await buildSessionActor(user.data.userId));
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
    return { ok: true, actor: await buildSessionActor(session.userId) };
  } catch (error) {
    failed('Error resolving the acting freelancer:', error, 'Something went wrong. Please try again.');
    return { ok: false, response: failureResponse() };
  }
}
