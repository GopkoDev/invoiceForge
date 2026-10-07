// T41 (spec.md §5 AC-07, AC-08; review-2026-09-28.md N-18) — the P2002 -> CONFLICT +
// captureMessage backstop in createInvoice and updateInvoice lost its only test when the F-08
// test was repurposed. A unique violation past the row lock on a SYSTEM-ASSIGNED number is an
// allocator bug (alert + CONFLICT with fieldErrors.invoiceNumber); on a MANUAL number it is just
// the user's conflict (CONFLICT, no alert).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoiceFindFirstMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/prisma', () => ({
  prisma: {
    invoice: { findFirst: invoiceFindFirstMock },
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

  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
  captureException: vi.fn(),
}));

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

vi.mock('@/lib/services/invoices/numbering', () => ({
  allocateInvoiceNumber: vi.fn().mockResolvedValue({
    invoiceNumber: 'INV-2026-0002',
    invoiceNumberKey: 'inv-2026-0002',
  }),
  isInvoiceKeyTaken: vi.fn().mockResolvedValue(false),
  lockSenderProfileRow: vi.fn(),
  normalizeInvoiceNumber: (s: string) => s.trim().toLowerCase(),
  peekNextInvoiceNumber: vi.fn(),
}));

const CONFLICT_MESSAGE = 'This invoice number is already used in this sender profile.';

function form(invoiceNumber: string) {
  return {
    invoiceNumber,
    status: 'DRAFT',
    senderProfileId: 'sp-1',
    bankAccountId: 'b-1',
    customerId: 'c-1',
    issueDate: '2026-01-01',
    dueDate: '2026-01-31',
    currency: 'USD',
    items: [{ id: 'i-1', productName: 'W', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
    loadedVersion: 0, // invoice-integrity T08: updateInvoice requires the loaded version
  } as never;
}

const zero = { toString: () => '0', toFixed: () => '0.00' };
const existing = {
  id: 'inv-1',
  senderProfileId: 'sp-1',
  invoiceNumber: 'OLD-1',
  invoiceNumberKey: 'old-1',
  issueDate: new Date('2026-01-01T00:00:00.000Z'),
  dueDate: new Date('2026-01-31T00:00:00.000Z'),
  status: 'DRAFT',
  paidAt: null,
  version: 0,
  total: zero,
  discount: zero,
  shipping: zero,
  taxRate: zero,
  items: [],
};

function txRejecting(model: 'create' | 'update') {
  transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: vi.fn().mockResolvedValue([{ issueDate: new Date('2026-01-01T00:00:00.000Z'), dueDate: new Date('2026-01-31T00:00:00.000Z') }]),
      invoiceItem: { deleteMany: vi.fn() },
      // invoice-integrity T08: updateInvoice reads the row under its lock.
      invoice: { findFirst: invoiceFindFirstMock, [model]: vi.fn().mockRejectedValue({ code: 'P2002' }) },
    })
  );
}

describe('createInvoice / updateInvoice — P2002 despite the lock (T41, N-18)', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    invoiceFindFirstMock.mockResolvedValue(existing);
  });

  afterEach(() => vi.clearAllMocks());

  it('createInvoice: a system-assigned number returns CONFLICT with fieldErrors.invoiceNumber and alerts', async () => {
    txRejecting('create');
    const { createInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await createInvoice(form(''));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('CONFLICT');
    expect(result.fieldErrors?.invoiceNumber).toEqual([CONFLICT_MESSAGE]);
    expect(captureMessageMock).toHaveBeenCalledWith(
      'invoice_number_conflict',
      expect.objectContaining({ extra: expect.anything() })
    );
  });

  it('createInvoice: a manual number returns the same CONFLICT and does not alert', async () => {
    txRejecting('create');
    const { createInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await createInvoice(form('MY-1'));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('CONFLICT');
    expect(result.fieldErrors?.invoiceNumber).toEqual([CONFLICT_MESSAGE]);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('updateInvoice: a system-assigned number returns CONFLICT with fieldErrors.invoiceNumber and alerts', async () => {
    txRejecting('update');
    const { updateInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await updateInvoice('inv-1', form(''));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('CONFLICT');
    expect(result.fieldErrors?.invoiceNumber).toEqual([CONFLICT_MESSAGE]);
    expect(captureMessageMock).toHaveBeenCalledWith(
      'invoice_number_conflict',
      expect.objectContaining({ extra: expect.anything() })
    );
  });

  it('updateInvoice: a manual number returns the same CONFLICT and does not alert', async () => {
    txRejecting('update');
    const { updateInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await updateInvoice('inv-1', form('MY-1'));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('CONFLICT');
    expect(captureMessageMock).not.toHaveBeenCalled();
  });
});
