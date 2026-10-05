// T22 (review 2026-10-01 S-05; ADR-0003, spec.md §6.1) — writes and lists that used to lean on an
// earlier ownership check carry the owner in their own where clause. Prisma is a recording stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const p = vi.hoisted(() => ({
  senderProfile: { findFirst: vi.fn() },
  bankAccount: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  customer: { findFirst: vi.fn() },
  product: { findFirst: vi.fn() },
  customPrice: { count: vi.fn(), findMany: vi.fn() },
  invoice: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/prisma', () => ({ prisma: p }));

vi.mock('@/lib/services/invoices/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/invoices/helpers')>()),
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
  it('createBankAccount default reset is scoped to the owner', async () => {
    await createBankAccount(actor, 'sp1', form);
    expect(p.bankAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { senderProfileId: 'sp1', senderProfile: { userId: 'user-a' } },
      })
    );
  });

  it('updateBankAccount default reset is scoped to the owner', async () => {
    p.bankAccount.findFirst.mockResolvedValue({ id: 'ba1', senderProfileId: 'sp1', isDefault: false });
    await updateBankAccount(actor, 'ba1', form);
    expect(p.bankAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          senderProfileId: 'sp1',
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
      total: zero,
      discount: zero,
      shipping: zero,
      taxRate: zero,
      items: [],
    });
    const deleteMany = vi.fn();
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ $queryRaw: vi.fn().mockResolvedValue([{ issueDate: new Date('2026-01-01T00:00:00.000Z'), dueDate: new Date('2026-01-31T00:00:00.000Z') }]), invoiceItem: { deleteMany }, invoice: { update: vi.fn().mockResolvedValue({ id: 'inv-1' }) } })
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
    } as never);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1', invoice: { senderProfile: { userId: 'user-a' } } },
    });
  });
});
