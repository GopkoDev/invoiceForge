// T49 (spec.md §5 AC-28, AC-07, AC-08; review-2026-09-30.md R-05, R-06, R-11).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureExceptionMock = vi.fn();
const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureExceptionMock(...a),
  captureMessage: (...a: unknown[]) => captureMessageMock(...a),
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const prismaMock = {
  user: { findUnique: vi.fn() },
  invoice: { findFirst: vi.fn(), findUnique: vi.fn() },
  product: { findMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('@/prisma', () => ({ prisma: prismaMock }));

const serializeMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/actions/invoice-actions/helpers')>()),
  serializeInvoice: (...a: unknown[]) => serializeMock(...a),
}));

describe('T49 FAILED reporting', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('R-05: auth() throws -> loader FAILED -> exactly one capture', async () => {
    authMock.mockRejectedValue(new Error('auth backend down'));
    const { getProducts } = await import('@/lib/actions/product-actions');

    const result = await getProducts();

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('FAILED');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('R-05: getAuthenticatedUser reports its catch through failed()', async () => {
    authMock.mockRejectedValue(new Error('auth backend down'));
    const { getAuthenticatedUser } = await import('@/lib/helpers/auth-helpers');

    await getAuthenticatedUser();

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('R-06: getInvoice serialize failure is reported', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    prismaMock.invoice.findFirst.mockResolvedValue({ id: 'inv-1', items: [] });
    prismaMock.invoice.findUnique.mockResolvedValue({ id: 'inv-1', items: [] });
    serializeMock.mockReturnValue(null);
    const { getInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await getInvoice('inv-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('FAILED');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('R-06: updateProfile with the user row gone returns UNAUTHORIZED', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    prismaMock.user.findUnique.mockResolvedValue(null);
    const { updateProfile } = await import('@/lib/actions/profile-actions');

    const result = await updateProfile({ name: 'A', email: 'a@example.com' } as never);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('R-06: deleteUserAccount with the user row gone returns UNAUTHORIZED', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    prismaMock.user.findUnique.mockResolvedValue(null);
    const { deleteUserAccount } = await import('@/lib/actions/account-actions');

    const result = await deleteUserAccount();

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('UNAUTHORIZED');
  });
});
