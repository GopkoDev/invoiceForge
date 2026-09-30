// T39 (spec.md §5 AC-28; review-2026-09-27.md F-38) —
// docs/features/architecture-hardening/tasks.json T39, cite sender-profile-actions.ts:188-191.
//
// Same gap as customer-actions.ts's deleteCustomer: deleteSenderProfile's outer catch never
// alerts error monitoring.
//
// RED (T39 not yet implemented): captureExceptionMock stays uncalled.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/prisma', () => ({
  prisma: {
    senderProfile: { findUnique: findUniqueMock, delete: deleteMock },
    invoice: { count: vi.fn() },
    bankAccount: { findMany: vi.fn() },
  },
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...args: unknown[]) => captureExceptionMock(...args) }));

describe('deleteSenderProfile — a thrown FAILED reaches error monitoring (T39, F-38)', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUniqueMock.mockResolvedValue({ id: 'sp-1', userId: 'user-1', _count: { invoices: 0 } });
    deleteMock.mockRejectedValue(new Error('connection reset'));
  });

  afterEach(() => vi.clearAllMocks());

  it('calls Sentry.captureException with the underlying error', async () => {
    const { deleteSenderProfile } = await import('@/lib/actions/sender-profile-actions');

    const result = await deleteSenderProfile('sp-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('FAILED');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
