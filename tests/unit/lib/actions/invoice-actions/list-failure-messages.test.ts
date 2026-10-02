// T26 (service-layer re-review 2026-10-01 R-03; spec.md §5 AC-01) — when the layer's list fails,
// the preview wrappers keep the messages main used, not the layer's generic one.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({ success: true, data: { userId: 'user-1', timeZone: 'UTC' } }),
}));
const listInvoices = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/invoices/invoices', async (orig) => ({
  ...(await orig<object>()),
  listInvoices: (...args: unknown[]) => listInvoices(...args),
}));
vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

describe('invoice list wrappers — failure messages (T26, R-03)', () => {
  beforeEach(() => {
    listInvoices.mockReset();
    listInvoices.mockResolvedValue({ success: false, code: 'FAILED', error: 'Failed to fetch invoices.' });
  });

  it.each([
    ['getInvoicesByCustomer', 'Failed to fetch customer invoices.'],
    ['getInvoicesBySenderProfile', 'Failed to fetch sender profile invoices.'],
  ] as const)('%s returns FAILED with %s', async (name, message) => {
    const actions = await import('@/lib/actions/invoice-actions/invoice-actions');
    const fn = actions[name] as (id: string, limit?: number) => Promise<unknown>;
    expect(await fn('id-1')).toEqual({ success: false, code: 'FAILED', error: message });
  });
});
