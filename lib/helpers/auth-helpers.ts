'use server';

import { auth } from '@/auth';
import { ActionResult } from '@/types/actions';

/**
 * Get authenticated user session
 * Returns user ID or error result
 */
export async function getAuthenticatedUser(): Promise<
  ActionResult<{ userId: string }>
> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    return {
      success: true,
      data: { userId: session.user.id },
    };
  } catch (error) {
    console.error('Error checking authentication:', error);
    return { success: false, error: 'Authentication failed' };
  }
}
