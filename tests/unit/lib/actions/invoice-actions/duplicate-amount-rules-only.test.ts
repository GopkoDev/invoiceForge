// T41 (spec.md §5 AC-12, AC-17; review-2026-09-28.md N-07) — duplicateInvoice's contract lists
// only UNAUTHORIZED, NOT_FOUND, FAILED. It used to run the whole form schema and return VALIDATION
// ("Please fix the highlighted fields." with nothing highlighted), blocking copies for rules that
// have nothing to do with amounts. It must check only the amount rules, and refuse with FAILED
// and a plain list message.
//
// RED (N-07 not yet fixed): the full schema rejects the empty unit / missing product name below
// with VALIDATION, and a negative price comes back as VALIDATION + fieldErrors.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findFirstMock = vi.fn();
const senderProfileFindFirstMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/prisma', () => ({
  prisma: {
    invoice: { findFirst: findFirstMock },
    senderProfile: { findFirst: senderProfileFindFirstMock },
    $transaction: transactionMock,
  },
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

vi.mock('@/lib/actions/invoice-actions/numbering', () => ({
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

describe('duplicateInvoice — amount rules only (T41, N-07)', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    senderProfileFindFirstMock.mockResolvedValue({ id: 'sp-1' });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ invoice: { create: vi.fn().mockResolvedValue({ id: 'inv-2', invoiceNumber: 'INV-2026-0002' }) } })
    );
  });

  afterEach(() => vi.clearAllMocks());

  it('a rule-breaking amount is refused with FAILED, a plain list message and no fieldErrors', async () => {
    findFirstMock.mockResolvedValue({
      ...originalInvoice,
      items: [{ ...baseItem, rate: -5 }],
    });
    const { duplicateInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await duplicateInvoice('inv-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('FAILED');
    expect(result.fieldErrors).toBeUndefined();
    expect(result.error).toContain("Price can't be negative.");
    expect(result.error).not.toBe('Please fix the highlighted fields.');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('a non-amount rule (empty unit) does not block the copy', async () => {
    findFirstMock.mockResolvedValue({
      ...originalInvoice,
      items: [{ ...baseItem, unit: '', name: '' }],
    });
    const { duplicateInvoice } = await import('@/lib/actions/invoice-actions/invoice-actions');

    const result = await duplicateInvoice('inv-1');

    expect(result.success).toBe(true);
  });
});
