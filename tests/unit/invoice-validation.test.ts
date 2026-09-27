// T11 (spec.md §5 AC-14, AC-15, AC-19) — invoiceFormSchema tightened bounds and messages.
//
// docs/features/architecture-hardening/tasks/t11-invoice-rules-and-status.md, Inlined context
// table ("Shared input InvoiceFormValues") + Field-error messages table (both
// contracts/server-actions.md §Invoices, verbatim), and test-plan.md rows:
//   - AC-14 "invoice schema enforces amount bounds" (unit)
//   - AC-15 "discount above subtotal plus shipping is rejected and equal is allowed" (unit)
//   - AC-19 (partial: "status ... rejected with a plain-language message" — schema-level enum
//     check; the paidAt-clearing half of AC-19 belongs to applyStatusChange, tested in
//     tests/unit/invoice-status.test.ts)
//
// RED (T11 not yet implemented): today's invoiceFormSchema (lib/validations/invoice.ts) has no
// upper bounds on quantity/price/shipping, no discount-vs-(subtotal+shipping) cap, and no
// "Unknown status." message on an invalid status — every failing case below currently either
// passes validation it shouldn't, or fails with the wrong message.
import { describe, expect, it } from 'vitest';
import { invoiceFormSchema, type InvoiceFormValues } from '@/lib/validations/invoice';

const MAX_AMOUNT = 99_999_999.99;

function baseInvoice(overrides: Partial<InvoiceFormValues> = {}): InvoiceFormValues {
  return {
    invoiceNumber: 'INV-0001',
    status: 'DRAFT',
    senderProfileId: 'sender-profile-1',
    bankAccountId: 'bank-account-1',
    customerId: 'customer-1',
    issueDate: new Date('2026-01-01'),
    dueDate: new Date('2026-01-15'),
    currency: 'USD',
    poNumber: '',
    paymentTerms: '',
    items: [
      {
        id: 'item-1',
        productId: undefined,
        productName: 'Widget',
        description: '',
        unit: 'pcs',
        quantity: 1,
        price: 100,
        total: 100,
      },
    ],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: '',
    terms: '',
    ...overrides,
  } as InvoiceFormValues;
}

function fieldMessages(result: ReturnType<typeof invoiceFormSchema.safeParse>, path: string): string[] {
  if (result.success) return [];
  return result.error.issues.filter((issue) => issue.path.join('.') === path).map((issue) => issue.message);
}

describe('invoiceFormSchema (AC-14, amount bounds)', () => {
  it('accepts a valid invoice', () => {
    const result = invoiceFormSchema.safeParse(baseInvoice());
    expect(result.success).toBe(true);
  });

  it('accepts the max boundary for quantity, price and shipping', () => {
    const result = invoiceFormSchema.safeParse(
      baseInvoice({
        items: [
          {
            id: 'item-1',
            productName: 'Widget',
            description: '',
            unit: 'pcs',
            quantity: MAX_AMOUNT,
            price: MAX_AMOUNT,
            total: 0,
          },
        ],
        shipping: MAX_AMOUNT,
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects a negative price with \"Price can't be negative.\"", () => {
    const result = invoiceFormSchema.safeParse(
      baseInvoice({
        items: [
          { id: 'item-1', productName: 'Widget', description: '', unit: 'pcs', quantity: 1, price: -0.01, total: 0 },
        ],
      })
    );
    expect(result.success).toBe(false);
    expect(fieldMessages(result, 'items.0.price')).toContain("Price can't be negative.");
  });

  it('accepts a price of exactly 0', () => {
    const result = invoiceFormSchema.safeParse(
      baseInvoice({
        items: [
          { id: 'item-1', productName: 'Widget', description: '', unit: 'pcs', quantity: 1, price: 0, total: 0 },
        ],
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects a price above the maximum', () => {
    const result = invoiceFormSchema.safeParse(
      baseInvoice({
        items: [
          {
            id: 'item-1',
            productName: 'Widget',
            description: '',
            unit: 'pcs',
            quantity: 1,
            price: MAX_AMOUNT + 0.01,
            total: 0,
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it.each([0, -1])('rejects a quantity of %s with "Quantity must be greater than zero."', (quantity) => {
    const result = invoiceFormSchema.safeParse(
      baseInvoice({
        items: [
          { id: 'item-1', productName: 'Widget', description: '', unit: 'pcs', quantity, price: 1, total: 0 },
        ],
      })
    );
    expect(result.success).toBe(false);
    expect(fieldMessages(result, 'items.0.quantity')).toContain('Quantity must be greater than zero.');
  });

  it('rejects a quantity above the maximum', () => {
    const result = invoiceFormSchema.safeParse(
      baseInvoice({
        items: [
          {
            id: 'item-1',
            productName: 'Widget',
            description: '',
            unit: 'pcs',
            quantity: MAX_AMOUNT + 0.01,
            price: 1,
            total: 0,
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects a negative shipping amount with \"Shipping can't be negative.\"", () => {
    const result = invoiceFormSchema.safeParse(baseInvoice({ shipping: -0.01 }));
    expect(result.success).toBe(false);
    expect(fieldMessages(result, 'shipping')).toContain("Shipping can't be negative.");
  });

  it('rejects a shipping amount above the maximum', () => {
    const result = invoiceFormSchema.safeParse(baseInvoice({ shipping: MAX_AMOUNT + 0.01 }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative discount with \"Discount can't be negative.\"", () => {
    const result = invoiceFormSchema.safeParse(baseInvoice({ discount: -0.01 }));
    expect(result.success).toBe(false);
    expect(fieldMessages(result, 'discount')).toContain("Discount can't be negative.");
  });

  it.each([-0.01, 100.01])(
    'rejects a tax rate of %s with the "Tax rate must be between 0 and 100 percent." message',
    (taxRate) => {
      const result = invoiceFormSchema.safeParse(baseInvoice({ taxRate }));
      expect(result.success).toBe(false);
      expect(fieldMessages(result, 'taxRate')).toContain('Tax rate must be between 0 and 100 %.');
    }
  );

  it.each([0, 100])('accepts a tax rate boundary of %s', (taxRate) => {
    const result = invoiceFormSchema.safeParse(baseInvoice({ taxRate }));
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status with "Unknown status."', () => {
    const result = invoiceFormSchema.safeParse(baseInvoice({ status: 'FOO' as never }));
    expect(result.success).toBe(false);
    expect(fieldMessages(result, 'status')).toContain('Unknown status.');
  });

  it('allows an empty invoiceNumber (system-assigned) and trims a manual one', () => {
    const emptyResult = invoiceFormSchema.safeParse(baseInvoice({ invoiceNumber: '   ' }));
    expect(emptyResult.success).toBe(true);
    if (emptyResult.success) {
      expect(emptyResult.data.invoiceNumber).toBe('');
    }
  });
});

describe('invoiceFormSchema (AC-15, discount cannot exceed subtotal + shipping)', () => {
  // subtotal = 1 x 100 = 100.00; shipping 10 -> cap is 110.
  it('rejects a discount above subtotal + shipping', () => {
    const result = invoiceFormSchema.safeParse(baseInvoice({ shipping: 10, discount: 110.01 }));
    expect(result.success).toBe(false);
    expect(fieldMessages(result, 'discount')).toContain("Discount can't exceed the subtotal plus shipping.");
  });

  it('accepts a discount exactly equal to subtotal + shipping (total becomes 0)', () => {
    const result = invoiceFormSchema.safeParse(baseInvoice({ shipping: 10, discount: 110 }));
    expect(result.success).toBe(true);
  });
});
