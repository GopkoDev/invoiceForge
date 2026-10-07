// T28 (re-review 2026-10-01 R-06; spec.md §5 AC-08, AC-19) — a numbering helper that finds no sender
// profile for the owner throws SenderProfileNotFoundError; create, update and duplicate map it to
// NOT_FOUND 'Sender profile not found.'. Numbering is mocked to throw; Prisma is a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({
  // invoice-integrity T01: invoice saves run inside a span; pass the callback straight through.
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
  captureException: vi.fn(), captureMessage: vi.fn() }));

const p = vi.hoisted(() => ({
  invoice: { findFirst: vi.fn() },
  senderProfile: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/prisma', () => ({ prisma: p }));

vi.mock('@/lib/services/invoices/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/invoices/helpers')>()),
  // invoice-integrity T07: create/duplicate run every draft rule through checkDraftRules.
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

vi.mock('@/lib/services/invoices/numbering', async () => {
  const { SenderProfileNotFoundError } = await import('@/lib/services/invoices/numbering-errors');
  return {
    allocateInvoiceNumber: vi.fn().mockRejectedValue(new SenderProfileNotFoundError()),
    isInvoiceKeyTaken: vi.fn().mockResolvedValue(false),
    lockSenderProfileRow: vi.fn(),
    normalizeInvoiceNumber: (s: string) => s.trim().toLowerCase(),
    peekNextInvoiceNumber: vi.fn(),
  };
});

import { createInvoice, duplicateInvoice, updateInvoice } from '@/lib/services/invoices/invoices';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { actingFreelancerForTest } from '../../support/acting-freelancer';

const zero = { toString: () => '0', toFixed: () => '0.00' };
const existing = {
  id: 'inv-1',
  senderProfileId: 'sp-1',
  customerId: 'c-1',
  bankAccountId: 'b-1',
  invoiceNumber: 'OLD-1',
  invoiceNumberKey: 'old-1',
  status: 'DRAFT',
  paidAt: null,
  total: zero,
  discount: zero,
  shipping: zero,
  taxRate: zero,
  items: [],
};

const form = {
  invoiceNumber: '',
  status: 'DRAFT',
  senderProfileId: 'sp-1',
  bankAccountId: 'b-1',
  customerId: 'c-1',
  issueDate: '2026-01-01',
  dueDate: '2026-01-31',
  currency: 'USD',
  items: [{ id: 'i-1', productName: 'W', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
} as never;

const NOT_FOUND = { success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' };

let actor: ActingFreelancer;
beforeEach(async () => {
  vi.clearAllMocks();
  actor = await actingFreelancerForTest('user-a', 'UTC');
  p.invoice.findFirst.mockResolvedValue(existing);
  p.senderProfile.findFirst.mockResolvedValue({ id: 'sp-1' });
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ $queryRaw: vi.fn().mockResolvedValue([{ issueDate: new Date('2026-01-01T00:00:00.000Z'), dueDate: new Date('2026-01-31T00:00:00.000Z') }]), invoiceItem: { deleteMany: vi.fn() }, invoice: { create: vi.fn(), update: vi.fn() } })
  );
});

describe('SenderProfileNotFoundError maps to NOT_FOUND (T28, R-06)', () => {
  it('createInvoice', async () => {
    expect(await createInvoice(actor, form)).toEqual(NOT_FOUND);
  });

  it('updateInvoice', async () => {
    expect(await updateInvoice(actor, 'inv-1', form)).toEqual(NOT_FOUND);
  });

  it('duplicateInvoice', async () => {
    p.invoice.findFirst.mockResolvedValue({
      ...existing,
      issueDate: new Date('2026-01-01'),
      dueDate: new Date('2026-01-31'),
      currency: 'USD',
      poNumber: '',
      paymentTerms: '',
      notes: '',
      terms: '',
      items: [
        { id: 'i-1', productId: null, name: 'W', description: '', unit: 'pcs', quantity: 1, rate: 100, amount: 100, currency: 'USD' },
      ],
    });
    expect(await duplicateInvoice(actor, 'inv-1')).toEqual(NOT_FOUND);
  });
});
