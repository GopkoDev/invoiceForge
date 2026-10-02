import 'server-only';
import { fail, type ActionFailure } from '@/types/result';

/** True for Prisma's "record to update/delete not found" error (P2025), and only that. */
export function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

/**
 * Awaits an owner-scoped write; a P2025 miss becomes NOT_FOUND (ADR-0003).
 * Every other error is rethrown untouched.
 */
export async function notFoundOnMiss<T>(
  write: PromiseLike<T>,
  message: string,
): Promise<T | ActionFailure> {
  try {
    return await write;
  } catch (error) {
    if (isRecordNotFoundError(error)) return fail('NOT_FOUND', message);
    throw error;
  }
}

/** updateMany/deleteMany fallback: a count of 0 means the owner-scoped row was not there. */
export function notFoundIfNoneAffected(count: number, message: string): ActionFailure | null {
  return count === 0 ? fail('NOT_FOUND', message) : null;
}
