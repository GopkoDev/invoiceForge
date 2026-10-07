// invoice-integrity T01 (spec.md §6 NFR "Latency p95" + "Generic failures from user input"; sad.md §7
// Monitoring, §11 risk "latency baseline") — invoice saves run in an `invoices.save` span and status
// changes in `invoices.status-change`; a generic FAILED is reported with a `path` tag. Behaviour-free:
// the results are the same FAILED as before. Every prisma call rejects here.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: () => {
        throw new Error('db down');
      },
    }
  ),
}));

const spans: Array<{ name: string; op?: string; attributes?: Record<string, unknown> }> = [];
const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  captureMessage: vi.fn(),
  startSpan: (options: { name: string; op?: string; attributes?: Record<string, unknown> }, callback: () => unknown) => {
    spans.push(options);
    return callback();
  },
}));

import {
  createInvoice,
  duplicateInvoice,
  updateInvoice,
  updateInvoiceStatus,
} from '@/lib/services/invoices/invoices';
import { actingFreelancerForTest } from '../../support/acting-freelancer';

const actor = await actingFreelancerForTest('user-1', 'UTC');
const form = {
  invoiceNumber: '',
  status: 'DRAFT' as const,
  senderProfileId: 'sp-1',
  bankAccountId: 'ba-1',
  customerId: 'cu-1',
  issueDate: '2026-03-10',
  dueDate: '2026-03-20',
  currency: 'USD' as const,
  items: [{ id: 'i', productName: 'Work', description: '', unit: 'h', quantity: 1, price: 10, total: 10 }],
};

describe('invoice save and status-change spans (T01)', () => {
  beforeEach(() => {
    spans.length = 0;
    captureExceptionMock.mockClear();
  });

  it.each([
    ['create', () => createInvoice(actor, form), 'Failed to create invoice.'],
    ['update', () => updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 }), 'Failed to update invoice.'],
    ['duplicate', () => duplicateInvoice(actor, 'inv-1'), 'Failed to duplicate invoice.'],
  ] as const)('%s runs inside invoices.save and tags its FAILED with the path', async (operation, run, message) => {
    const result = await run();

    expect(result).toEqual({ success: false, code: 'FAILED', error: message });
    expect(spans).toEqual([{ name: 'invoices.save', op: 'function', attributes: { operation } }]);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0][1]).toEqual({ tags: { path: `invoices.${operation}` } });
  });

  it('updateInvoiceStatus runs inside invoices.status-change and tags its FAILED with the path', async () => {
    const result = await updateInvoiceStatus(actor, 'inv-1', 'PAID');

    expect(result).toEqual({ success: false, code: 'FAILED', error: 'Failed to update invoice status.' });
    expect(spans).toEqual([{ name: 'invoices.status-change', op: 'function' }]);
    expect(captureExceptionMock.mock.calls[0][1]).toEqual({ tags: { path: 'invoices.status-change' } });
  });

  it('attaches the operation only — no form body', async () => {
    await createInvoice(actor, form);
    await updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 });
    expect(spans).toHaveLength(2);
    for (const span of spans) {
      expect(JSON.stringify(span)).not.toMatch(/Work|sp-1|ba-1|cu-1/);
    }
  });
});
