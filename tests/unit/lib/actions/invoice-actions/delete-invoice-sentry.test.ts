// T39 (spec.md §5 AC-28; review-2026-09-27.md F-38) —
// docs/features/architecture-hardening/tasks.json T39, cite invoice-actions.ts:982-983 (and,
// representatively, every other FAILED catch in this file — the finding: "Only account-actions
// calls captureException").
//
// RED (T39 not yet implemented): deleteInvoice's outer catch never alerts error monitoring.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findFirstMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/prisma', () => ({
  prisma: {
    invoice: { findFirst: findFirstMock, delete: deleteMock },
  },
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const captureExceptionMock = vi.fn();
const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
}));

describe('deleteInvoice — a thrown FAILED reaches error monitoring (T39, F-38)', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findFirstMock.mockResolvedValue({ status: 'DRAFT' });
    deleteMock.mockRejectedValue(new Error('connection reset'));
  });

  afterEach(() => vi.clearAllMocks());

  it('calls Sentry.captureException with the underlying error', async () => {
    const { deleteInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await deleteInvoice('inv-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('FAILED');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
