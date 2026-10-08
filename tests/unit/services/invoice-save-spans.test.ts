// invoice-integrity T01 (spec.md §6 NFR "Latency p95" + "Generic failures from user input"; sad.md §7
// Monitoring, §11 risk "latency baseline") — invoice saves run in an `invoices.save` span and status
// changes in `invoices.status-change`; a generic FAILED is reported with a `path` tag. Behaviour-free:
// the results are the same FAILED as before. Every prisma call rejects here.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// T28: `tx.current` is null for the "every prisma call rejects" tests; the outcome tests set it.
const tx = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('@/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === '$transaction' && tx.current) {
          return (run: (client: unknown) => unknown) => run(tx.current);
        }
        throw new Error('db down');
      },
    }
  ),
}));

const draftRules = vi.hoisted(() => ({ fieldErrors: {} as Record<string, string[]> }));
vi.mock('@/lib/services/invoices/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/invoices/helpers')>()),
  checkDraftRules: vi.fn(async () => ({
    success: true,
    data: { senderProfile: { id: 'sp-1' }, customer: { id: 'cu-1' }, bankAccount: { id: 'ba-1' }, fieldErrors: draftRules.fieldErrors },
  })),
}));
vi.mock('@/lib/services/invoices/numbering', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/invoices/numbering')>()),
  lockSenderProfileRow: vi.fn(),
}));

const spans: Array<{ name: string; op?: string; attributes?: Record<string, unknown> }> = [];
// What each span's callback set on its span, in the order the spans started.
const spanAttributes: Array<Record<string, unknown>> = [];
const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  captureMessage: vi.fn(),
  startSpan: (
    options: { name: string; op?: string; attributes?: Record<string, unknown> },
    callback: (span: { setAttribute: (key: string, value: unknown) => void }) => unknown
  ) => {
    spans.push(options);
    const set: Record<string, unknown> = {};
    spanAttributes.push(set);
    return callback({ setAttribute: (key, value) => void (set[key] = value) });
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
    spanAttributes.length = 0;
    tx.current = null;
    draftRules.fieldErrors = {};
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

// T28 (review S2; sad.md §7 Monitoring, §8 "refusals are counted, not logged") — the span of every
// save and status change records its outcome: `ok`, or `refused:<kind>`; ids and kinds only.
describe('invoice save and status-change span outcomes (T28)', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    version: 0,
    status: 'DRAFT',
    paidAt: null,
    senderProfileId: 'sp-1',
    customerId: 'cu-1',
    bankAccountId: 'ba-1',
    invoiceNumber: 'INV-1',
    currency: 'USD',
    issueDate: new Date('2026-03-10T00:00:00Z'),
    dueDate: new Date('2026-03-20T00:00:00Z'),
    taxRate: 0,
    discount: 0,
    shipping: 0,
    items: [],
    ...over,
  });
  const withInvoice = (invoice: Record<string, unknown>) => {
    tx.current = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'inv-1' }]),
      invoice: { findFirst: vi.fn().mockResolvedValue(invoice) },
    };
  };
  const outcome = () => spanAttributes.at(-1)?.outcome;

  beforeEach(() => {
    spans.length = 0;
    spanAttributes.length = 0;
    tx.current = null;
    draftRules.fieldErrors = {};
  });

  it('sets refused:lifecycle on a cancelled invoice saved', async () => {
    withInvoice(stored({ status: 'CANCELLED' }));
    const result = await updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 });
    expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(outcome()).toBe('refused:lifecycle');
  });

  it('sets refused:lifecycle when a create asks for a status other than DRAFT', async () => {
    const result = await createInvoice(actor, { ...form, status: 'PENDING' });
    expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(outcome()).toBe('refused:lifecycle');
  });

  it('sets refused:lifecycle on a status change the lifecycle refuses', async () => {
    withInvoice(stored({ status: 'CANCELLED' }));
    const result = await updateInvoiceStatus(actor, 'inv-1', 'PAID');
    expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(spans.at(-1)?.name).toBe('invoices.status-change');
    expect(outcome()).toBe('refused:lifecycle');
  });

  it('sets refused:changed-elsewhere on an outdated loaded version', async () => {
    withInvoice(stored({ version: 3 }));
    const result = await updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 });
    expect(result).toMatchObject({ success: false, code: 'CONFLICT' });
    expect(outcome()).toBe('refused:changed-elsewhere');
  });

  it('sets refused:locked-field when an issued invoice has a locked field changed', async () => {
    withInvoice(stored({ status: 'PENDING', customerId: 'cu-other' }));
    const result = await updateInvoice(actor, 'inv-1', { ...form, status: 'PENDING', loadedVersion: 0 });
    expect(result).toMatchObject({ success: false, code: 'VALIDATION', details: { kind: 'ISSUED_INVOICE_LOCKED' } });
    expect(outcome()).toBe('refused:locked-field');
  });

  it('sets refused:currency when the bank account or a line product is in another currency', async () => {
    withInvoice(stored());
    draftRules.fieldErrors = { bankAccountId: ['This account is in EUR while the invoice is in USD.'] };
    const result = await updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 });
    expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(outcome()).toBe('refused:currency');

    draftRules.fieldErrors = { 'items.0.productId': ['priced in EUR'] };
    await updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 });
    expect(outcome()).toBe('refused:currency');
  });

  it('sets refused:bounds when an amount is out of bounds', async () => {
    withInvoice(stored());
    draftRules.fieldErrors = { 'items.0.price': ['Price is too large.'] };
    const result = await updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 });
    expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(outcome()).toBe('refused:bounds');
  });

  it('sets refused:currency when issuing from the list hits a currency mismatch', async () => {
    withInvoice(stored());
    draftRules.fieldErrors = { bankAccountId: ['mismatch'] };
    const result = await updateInvoiceStatus(actor, 'inv-1', 'PENDING');
    expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(outcome()).toBe('refused:currency');
  });

  it('sets refused:bounds on a create whose draft rules fail on an amount', async () => {
    tx.current = {};
    draftRules.fieldErrors = { discount: ['Discount is too large.'] };
    const result = await createInvoice(actor, form);
    expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(outcome()).toBe('refused:bounds');
  });

  it('sets ok on a status change that changes nothing', async () => {
    withInvoice(stored({ status: 'PAID', paidAt: new Date('2026-03-12T00:00:00Z') }));
    const result = await updateInvoiceStatus(actor, 'inv-1', 'PAID');
    expect(result.success).toBe(true);
    expect(outcome()).toBe('ok');
  });

  it('sets failed on a generic FAILED', async () => {
    await updateInvoiceStatus(actor, 'inv-1', 'PAID');
    expect(outcome()).toBe('failed');
  });

  it('carries only the outcome kind — no form values or amounts', async () => {
    withInvoice(stored({ version: 3 }));
    draftRules.fieldErrors = { 'items.0.price': ['Price is too large.'] };
    await updateInvoice(actor, 'inv-1', { ...form, loadedVersion: 0 });
    expect(JSON.stringify(spanAttributes)).not.toMatch(/Work|sp-1|ba-1|cu-1|INV-1|large/);
  });
});
