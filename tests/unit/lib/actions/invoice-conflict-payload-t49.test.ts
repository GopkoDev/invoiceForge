// T49 R-11 (AC-07, AC-08; sad.md:746) — the invoice_number_conflict alert carries ids, the
// number and wasAllocated only, never the invoice form (descriptions, prices, notes).
import { afterEach, describe, expect, it, vi } from 'vitest';

const transactionMock = vi.fn();
vi.mock('@/prisma', () => ({
  prisma: { invoice: { findFirst: vi.fn().mockResolvedValue(null) }, $transaction: transactionMock },
}));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'user-1' } }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => captureMessageMock(...a),
  captureException: vi.fn(),
}));

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
    invoiceNumber: 'INV-2026-0002',
    invoiceNumberKey: 'inv-2026-0002',
  }),
  isInvoiceKeyTaken: vi.fn().mockResolvedValue(false),
  lockSenderProfileRow: vi.fn(),
  normalizeInvoiceNumber: (s: string) => s.trim().toLowerCase(),
  peekNextInvoiceNumber: vi.fn(),
}));

describe('invoice_number_conflict payload (T49 R-11)', () => {
  afterEach(() => vi.clearAllMocks());

  it('createInvoice sends no form data to Sentry', async () => {
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ invoice: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) } })
    );
    const { createInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    await createInvoice({
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: 'sp-1',
      bankAccountId: 'b-1',
      customerId: 'c-1',
      issueDate: '2026-01-01',
      dueDate: '2026-01-31',
      currency: 'USD',
      notes: 'SECRET-NOTE-XYZ',
      items: [
        {
          id: 'i-1',
          productName: 'W',
          description: 'SECRET-DESC-XYZ',
          unit: 'pcs',
          quantity: 1,
          price: 987.65,
          total: 987.65,
        },
      ],
    } as never);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [name, ctx] = captureMessageMock.mock.calls[0];
    expect(name).toBe('invoice_number_conflict');
    const payload = JSON.stringify(ctx);
    expect(payload).not.toContain('SECRET-NOTE-XYZ');
    expect(payload).not.toContain('SECRET-DESC-XYZ');
    expect(payload).not.toContain('987.65');
    expect(ctx.extra).toMatchObject({ wasAllocated: true });
    expect(Object.keys(ctx.extra).sort()).not.toContain('data');
  });

  // T55 S-03: the update path carries the same rule — the exact key set, no form data.
  it('updateInvoice sends only id, senderProfileId, invoiceNumber and wasAllocated', async () => {
    const zero = { toString: () => '0', toFixed: () => '0.00' };
    const { prisma } = await import('@/prisma');
    (prisma.invoice.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        invoiceItem: { deleteMany: vi.fn() },
        invoice: { update: vi.fn().mockRejectedValue({ code: 'P2002' }) },
      })
    );
    const { updateInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    await updateInvoice('inv-1', {
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: 'sp-1',
      bankAccountId: 'b-1',
      customerId: 'c-1',
      issueDate: '2026-01-01',
      dueDate: '2026-01-31',
      currency: 'USD',
      notes: 'SECRET-NOTE-XYZ',
      items: [
        {
          id: 'i-1',
          productName: 'W',
          description: 'SECRET-DESC-XYZ',
          unit: 'pcs',
          quantity: 1,
          price: 987.65,
          total: 987.65,
        },
      ],
    } as never);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [name, ctx] = captureMessageMock.mock.calls[0];
    expect(name).toBe('invoice_number_conflict');
    const payload = JSON.stringify(ctx);
    expect(payload).not.toContain('SECRET-NOTE-XYZ');
    expect(payload).not.toContain('SECRET-DESC-XYZ');
    expect(payload).not.toContain('987.65');
    expect(Object.keys(ctx.extra).sort()).toEqual(
      ['id', 'invoiceNumber', 'senderProfileId', 'wasAllocated'].sort()
    );
    expect(ctx.extra).toMatchObject({ id: 'inv-1', senderProfileId: 'sp-1', wasAllocated: true });
  });
});
