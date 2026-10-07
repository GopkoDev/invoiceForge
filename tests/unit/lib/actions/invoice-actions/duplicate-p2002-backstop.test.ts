// T39 (spec.md §5 AC-21, AC-28; review-2026-09-27.md F-39) —
// docs/features/architecture-hardening/tasks.json T39, cite lib/actions/invoice-actions/
// invoice-actions.ts:1105-1111.
//
// duplicateInvoice's contract (contracts/server-actions.md §duplicateInvoice, verbatim) lists
// only UNAUTHORIZED, NOT_FOUND, FAILED as outcomes — never CONFLICT, because the duplicate flow
// has no invoiceNumber field on screen to attach a field error to (unlike createInvoice/
// updateInvoice's manual-number path). A P2002 on the auto-allocated number here can only mean
// the allocator's own row lock and key check (ADR-0005) were bypassed — an allocator bug, not a
// user-facing conflict — so it needs the same `captureMessage('invoice_number_conflict', …)`
// backstop alert that createInvoice/updateInvoice already raise (checklist), not a silent
// CONFLICT the UI can't render (there's no invoiceNumber field to show it against).
//
// RED (T39 not yet implemented): the current catch block returns `fail('CONFLICT', …,
// { fieldErrors: { invoiceNumber: [...] } })` on `isUniqueConstraintError(error)` and never
// calls `captureMessage`, so this test's assertions on `result.code` and `captureMessageMock`
// fail against the current code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findFirstMock = vi.fn();
const senderProfileFindFirstMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/prisma', () => ({
  prisma: {
    invoice: { findFirst: findFirstMock },
    senderProfile: { findFirst: senderProfileFindFirstMock },
    // invoice-integrity T07: the duplicate runs the draft rules (relations + currencies).
    customer: { findFirst: vi.fn().mockResolvedValue({ id: 'cust-1' }) },
    bankAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'bank-1', currency: 'USD' }) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: transactionMock,
  },
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/services/profile/profile', () => ({ getSavedTimeZone: async () => null, seedTimeZoneIfEmpty: async () => false }));

const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  // invoice-integrity T01: invoice saves run inside a span; pass the callback straight through.
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
  captureMessage: (...args: unknown[]) => captureMessageMock(...args) }));

// duplicateInvoice always auto-allocates (never a manual number), so this test skips the real
// row-locked allocator entirely and drives the P2002-despite-the-lock path directly.
vi.mock('@/lib/services/invoices/numbering', () => ({
  allocateInvoiceNumber: vi.fn().mockResolvedValue({
    invoiceNumber: 'INV-2026-0002',
    invoiceNumberKey: 'inv-2026-0002',
  }),
  isInvoiceKeyTaken: vi.fn(),
  lockSenderProfileRow: vi.fn(),
  normalizeInvoiceNumber: (s: string) => s.trim().toLowerCase(),
  peekNextInvoiceNumber: vi.fn(),
}));

const baseItem = {
  id: 'item-1',
  productId: null,
  name: 'Consulting',
  description: '',
  unit: 'hours',
  quantity: 2,
  rate: 100,
  amount: 200,
  currency: 'USD',
};

const originalInvoice = {
  id: 'inv-1',
  senderProfileId: 'sp-1',
  customerId: 'cust-1',
  bankAccountId: 'bank-1',
  invoiceNumber: 'INV-2026-0001',
  status: 'DRAFT',
  issueDate: new Date('2026-01-01'),
  dueDate: new Date('2026-01-31'),
  currency: 'USD',
  poNumber: '',
  paymentTerms: '',
  taxRate: 0,
  discount: 0,
  shipping: 0,
  notes: '',
  terms: '',
  items: [baseItem],
};

describe('duplicateInvoice — P2002 despite the lock (T39, F-39)', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findFirstMock.mockResolvedValue(originalInvoice);
    senderProfileFindFirstMock.mockResolvedValue({ id: 'sp-1' });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ invoice: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) } })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns FAILED, not CONFLICT (matches the contract\'s outcome list — no invoiceNumber field exists to attach a fieldError to)', async () => {
    const { duplicateInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await duplicateInvoice('inv-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('FAILED');
    expect(result.fieldErrors).toBeUndefined();
  });

  it('alerts the allocator-bug backstop via Sentry.captureMessage', async () => {
    const { duplicateInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    await duplicateInvoice('inv-1');

    expect(captureMessageMock).toHaveBeenCalledWith(
      'invoice_number_conflict',
      expect.objectContaining({ extra: expect.anything() })
    );
  });
});
