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

vi.mock('@/lib/actions/invoice-actions/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/actions/invoice-actions/helpers')>()),
  verifyInvoiceRelations: vi.fn().mockResolvedValue({
    success: true,
    data: { senderProfile: { id: 'sp-1' }, customer: { id: 'c-1' }, bankAccount: { id: 'b-1' } },
  }),
  verifyItemProductsOwnership: vi.fn().mockResolvedValue({ success: true, data: undefined }),
  buildSenderSnapshot: vi.fn().mockReturnValue({}),
  buildCustomerSnapshot: vi.fn().mockReturnValue({}),
  buildBankAccountSnapshot: vi.fn().mockReturnValue({}),
}));
vi.mock('@/lib/actions/invoice-actions/numbering', () => ({
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
});
