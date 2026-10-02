// T23 (service-layer review 2026-10-01 S-06; spec.md §5 AC-01) — getInvoicesByCustomer and
// getInvoicesBySenderProfile hand the layer a page only when a limit was given; without one the
// layer's own default must not silently cap the preview list (as getBankAccounts does).
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

describe('invoice list wrappers — limit passthrough (T23, S-06)', () => {
  beforeEach(() => {
    listInvoices.mockReset();
    listInvoices.mockResolvedValue({ success: true, data: { items: [] } });
  });

  it.each([
    ['getInvoicesByCustomer', { customerId: 'c1' }],
    ['getInvoicesBySenderProfile', { senderProfileId: 's1' }],
  ] as const)('%s passes no page without a limit and page 1 + pageSize with one', async (name, filter) => {
    const actions = await import('@/lib/actions/invoice-actions/invoice-actions');
    const fn = actions[name] as (id: string, limit?: number) => Promise<unknown>;
    const id = Object.values(filter)[0];

    await fn(id);
    expect(listInvoices).toHaveBeenLastCalledWith(expect.anything(), filter);

    await fn(id, 5);
    expect(listInvoices).toHaveBeenLastCalledWith(expect.anything(), { ...filter, page: 1, pageSize: 5 });
  });
});
