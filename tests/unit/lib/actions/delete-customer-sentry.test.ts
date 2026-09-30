// T39 (spec.md §5 AC-28; review-2026-09-27.md F-38) —
// docs/features/architecture-hardening/tasks.json T39, cite customer-actions.ts:214-216.
//
// "The cause of a FAILED result never reaches Sentry. Only account-actions calls
// captureException." deleteCustomer's outer catch logs to console and returns FAILED, but never
// alerts error monitoring, unlike account-actions.ts's deleteUserAccount/getAccountDeletionSummary.
//
// RED (T39 not yet implemented): the catch block below never imports or calls
// Sentry.captureException, so captureExceptionMock stays uncalled.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findFirstMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/prisma', () => ({
  prisma: {
    customer: { findFirst: findFirstMock, delete: deleteMock },
    invoice: { count: vi.fn() },
  },
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...args: unknown[]) => captureExceptionMock(...args) }));

describe('deleteCustomer — a thrown FAILED reaches error monitoring (T39, F-38)', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findFirstMock.mockResolvedValue({ id: 'cust-1', _count: { invoices: 0 } });
    deleteMock.mockRejectedValue(new Error('connection reset'));
  });

  afterEach(() => vi.clearAllMocks());

  it('calls Sentry.captureException with the underlying error', async () => {
    const { deleteCustomer } = await import('@/lib/actions/customer-actions');

    const result = await deleteCustomer('cust-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('FAILED');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
