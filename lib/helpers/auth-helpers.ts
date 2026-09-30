'use server';

import { auth } from '@/auth';
import { ActionResult, ok, fail } from '@/types/actions';
import { failed } from '@/lib/actions/action-result-helpers';

/**
 * Get authenticated user session
 * Returns user ID or a coded error result
 */
export async function getAuthenticatedUser(): Promise<
  ActionResult<{ userId: string }>
> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
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
