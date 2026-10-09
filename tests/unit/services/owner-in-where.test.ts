// T22 (review 2026-10-01 S-05; ADR-0003, spec.md §6.1) — writes and lists that used to lean on an
// earlier ownership check carry the owner in their own where clause. Prisma is a recording stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({
  // invoice-integrity T01: invoice saves run inside a span; pass the callback straight through.
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
  captureException: vi.fn(), captureMessage: vi.fn() }));

const p = vi.hoisted(() => ({
  senderProfile: { findFirst: vi.fn() },
  bankAccount: {
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  customer: { findFirst: vi.fn() },
  product: { findFirst: vi.fn(), update: vi.fn() },
  invoiceItem: { groupBy: vi.fn() },
  customPrice: { count: vi.fn(), findMany: vi.fn() },
  invoice: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/prisma', () => ({ prisma: p }));

vi.mock('@/lib/services/invoices/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/invoices/helpers')>()),
  // invoice-integrity T07/T09: create, duplicate and the draft save run checkDraftRules.
  checkDraftRules: vi.fn().mockResolvedValue({
    success: true,
    data: { senderProfile: { id: 'sp-1' }, customer: { id: 'c-1' }, bankAccount: { id: 'b-1' }, fieldErrors: {} },
  }),
  verifyInvoiceRelations: vi.fn().mockResolvedValue({
    success: true,
    data: { senderProfile: { id: 'sp-1' }, customer: { id: 'c-1' }, bankAccount: { id: 'b-1' } },
  }),
  verifyItemProductsOwnership: vi.fn().mockResolvedValue({ success: true, data: undefined }),
  buildSenderSnapshot: vi.fn().mockReturnValue({}),
  buildCustomerSnapshot: vi.fn().mockReturnValue({}),
  buildBankAccountSnapshot: vi.fn().mockReturnValue({}),
}));
vi.mock('@/lib/services/invoices/numbering', () => ({
  allocateInvoiceNumber: vi.fn().mockResolvedValue({
    invoiceNumber: 'INV-1',
    invoiceNumberKey: 'inv-1',
  }),
  isInvoiceKeyTaken: vi.fn().mockResolvedValue(false),
  lockSenderProfileRow: vi.fn(),
  normalizeInvoiceNumber: (s: string) => s.trim().toLowerCase(),
  peekNextInvoiceNumber: vi.fn(),
}));

import { updateInvoice } from '@/lib/services/invoices/invoices';
import { updateProduct } from '@/lib/services/products/products';
import { createBankAccount, updateBankAccount } from '@/lib/services/bank-accounts/bank-accounts';
import {
  listCustomerCustomPrices,
  listProductCustomPrices,
} from '@/lib/services/custom-prices/custom-prices';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { actingFreelancerForTest } from '../../support/acting-freelancer';

let actor: ActingFreelancer;
const form = {
  bankName: 'Bank',
  accountName: 'Holder',
  accountNumber: '123456789',
  currency: 'USD',
  isDefault: true,
} as never;

beforeEach(async () => {
  vi.clearAllMocks();
  actor = await actingFreelancerForTest('user-a', 'UTC');
  p.senderProfile.findFirst.mockResolvedValue({ id: 'sp1' });
  p.bankAccount.create.mockResolvedValue({ id: 'ba1' });
  p.bankAccount.update.mockResolvedValue({ id: 'ba1' });
  p.customer.findFirst.mockResolvedValue({ id: 'c1' });
  p.product.findFirst.mockResolvedValue({ id: 'p1' });
  p.customPrice.count.mockResolvedValue(0);
  p.customPrice.findMany.mockResolvedValue([]);
});

describe('owner in the where clause (T22, S-05)', () => {
  // invoice-integrity T12: default writes run in a transaction under the sender profile's row lock;
  // the stub transaction records on the same mocks.
  function lockedTransaction() {
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ ...p, $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]) })
    );
  }

  it('createBankAccount default reset is scoped to the owner', async () => {
    lockedTransaction();
    p.bankAccount.count.mockResolvedValue(1);
    await createBankAccount(actor, 'sp1', form);
    expect(p.bankAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { senderProfileId: 'sp1', isDefault: true, senderProfile: { userId: 'user-a' } },
      })
    );
  });

  it('updateBankAccount default reset is scoped to the owner', async () => {
    lockedTransaction();
    p.bankAccount.findFirst.mockResolvedValue({ id: 'ba1', senderProfileId: 'sp1', isDefault: false, currency: 'USD' });
    await updateBankAccount(actor, 'ba1', form);
    expect(p.bankAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          senderProfileId: 'sp1',
          isDefault: true,
          id: { not: 'ba1' },
          senderProfile: { userId: 'user-a' },
        },
      })
    );
  });

  it('listCustomerCustomPrices filters by the owner of the customer', async () => {
    await listCustomerCustomPrices(actor, 'c1');
    expect(p.customPrice.count).toHaveBeenCalledWith({
      where: { customerId: 'c1', customer: { userId: 'user-a' } },
    });
    expect(p.customPrice.findMany.mock.calls[0][0].where).toEqual({
      customerId: 'c1',
      customer: { userId: 'user-a' },
    });
  });

  it('listProductCustomPrices filters by the owner of the product', async () => {
    await listProductCustomPrices(actor, 'p1');
    expect(p.customPrice.count).toHaveBeenCalledWith({
      where: { productId: 'p1', product: { userId: 'user-a' } },
    });
    expect(p.customPrice.findMany.mock.calls[0][0].where).toEqual({
      productId: 'p1',
      product: { userId: 'user-a' },
    });
  });

  it('updateInvoice deletes the old items only through the owner of the invoice (T28, R-05)', async () => {
    const zero = { toString: () => '0', toFixed: () => '0.00' };
    p.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      senderProfileId: 'sp-1',
      invoiceNumber: 'OLD-1',
      invoiceNumberKey: 'old-1',
      status: 'DRAFT',
      paidAt: null,
      version: 0,
      issueDate: new Date('2026-01-01T00:00:00.000Z'),
      dueDate: new Date('2026-01-31T00:00:00.000Z'),
      total: zero,
      discount: zero,
      shipping: zero,
      taxRate: zero,
      items: [],
    });
    const deleteMany = vi.fn();
    const queryRaw = vi.fn().mockResolvedValue([{ issueDate: new Date('2026-01-01T00:00:00.000Z'), dueDate: new Date('2026-01-31T00:00:00.000Z') }]);
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ $queryRaw: queryRaw, invoiceItem: { deleteMany }, invoice: { findFirst: p.invoice.findFirst, update: vi.fn().mockResolvedValue({ id: 'inv-1' }) } })
    );
    await updateInvoice(actor, 'inv-1', {
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: 'sp-1',
      bankAccountId: 'b-1',
      customerId: 'c-1',
      issueDate: '2026-01-01',
      dueDate: '2026-01-31',
      currency: 'USD',
      items: [{ id: 'i-1', productName: 'W', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      loadedVersion: 0,
    } as never);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1', invoice: { senderProfile: { userId: 'user-a' } } },
    });
  });

  it('updateInvoice locks the invoice row through the owner (T44, I-04)', async () => {
    const zero = { toString: () => '0', toFixed: () => '0.00' };
    p.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', senderProfileId: 'sp-1', invoiceNumber: 'OLD-1', invoiceNumberKey: 'old-1',
      status: 'DRAFT', paidAt: null, version: 0, issueDate: new Date('2026-01-01T00:00:00.000Z'), dueDate: new Date('2026-01-31T00:00:00.000Z'), total: zero, discount: zero, shipping: zero, taxRate: zero, items: [],
    });
    const queryRaw = vi.fn().mockResolvedValue([{ issueDate: new Date('2026-01-01T00:00:00.000Z'), dueDate: new Date('2026-01-31T00:00:00.000Z') }]);
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ $queryRaw: queryRaw, invoiceItem: { deleteMany: vi.fn() }, invoice: { findFirst: p.invoice.findFirst, update: vi.fn().mockResolvedValue({ id: 'inv-1' }) } })
    );
    await updateInvoice(actor, 'inv-1', {
      invoiceNumber: '', status: 'DRAFT', senderProfileId: 'sp-1', bankAccountId: 'b-1', customerId: 'c-1',
      issueDate: '2026-01-01', dueDate: '2026-01-31', currency: 'USD',
      items: [{ id: 'i-1', productName: 'W', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      loadedVersion: 0,
    } as never);
    const lock = queryRaw.mock.calls.find(([strings]) => Array.isArray(strings) && strings.join('?').includes('FOR UPDATE'));
    expect(lock, 'the FOR UPDATE query ran').toBeDefined();
    const [strings, ...values] = lock as [string[], ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain('"SenderProfile"');
    expect(sql).toContain('"userId"');
    expect(values).toContain('user-a');
  });

  it('updateProduct counts usage owner-scoped, inside a transaction under the product row lock (T25, S1/F7)', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ locked: 1 }]);
    const order: string[] = [];
    queryRaw.mockImplementation(async () => {
      order.push('lock');
      return [{ locked: 1 }];
    });
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ ...p, $queryRaw: queryRaw })
    );
    p.product.findFirst.mockImplementation(async () => {
      order.push('read');
      return { id: 'p1', currency: 'USD', unit: 'hour', _count: { invoiceItems: 0 } };
    });
    p.invoiceItem.groupBy.mockImplementation(async () => {
      order.push('count');
      return [];
    });
    p.product.update.mockImplementation(async () => {
      order.push('update');
      return { id: 'p1' };
    });

    const result = await updateProduct(actor, 'p1', {
      name: 'N', description: '', unit: 'hour', price: '12.3', currency: 'EUR', isActive: true,
    });

    expect(result.success).toBe(true);
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain('"Product"');
    expect(sql).toContain('FOR UPDATE');
    expect(values).toEqual(expect.arrayContaining(['p1', 'user-a']));
    expect(p.invoiceItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'p1', product: { userId: 'user-a' } } })
    );
    expect(order[0]).toBe('lock');
    expect(order).toEqual(['lock', 'read', 'count', 'update']);
    expect(p.product.update.mock.calls[0][0].data.price).toBe(12.3);
  });
});
