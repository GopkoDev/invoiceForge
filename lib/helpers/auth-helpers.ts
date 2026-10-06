'use server';

import { auth } from '@/auth';
import { ActionResult, ok, fail } from '@/types/actions';
import { failed } from '@/lib/services/_shared/result-helpers';
import { isVerifiedSession } from '@/lib/helpers/verified-session';

/**
 * Get authenticated user session
 * Returns user ID or a coded error result
 */
export async function getAuthenticatedUser(): Promise<
  ActionResult<{ userId: string }>
> {
  try {
    const session = await auth();

    if (!isVerifiedSession(session)) {
      return fail('UNAUTHORIZED', 'Not signed in.');
    }

    return ok({ userId: session.user.id });
  } catch (error) {
    return failed(
      'Error checking authentication:',
      error,
      'Something went wrong. Please try again.'
    );
  }
}
