// invoice-integrity T05 (spec.md §5 AC-09, AC-19, AC-20b) — the shared invoice rules as plain
// functions (the service runs them inside its transaction; the editor's client schema runs them too),
// plus loadedVersion on the update schema. Messages: contracts/server-actions.md §Field-error messages.
// docs/features/invoice-integrity/tasks/t05-amount-and-date-bounds.md
import { describe, expect, it } from 'vitest';
import {
  checkAmountBounds,
  checkDiscountCap,
  checkDraftAmountRules,
  checkDueDate,
  clientInvoiceFormSchema,
  invoiceAmountsSchema,
  invoiceUpdateFormSchema,
  invoiceShapeSchema,
} from '@/lib/validations/invoice';

const MSG = {
  line: "The line amount can't exceed 99,999,999.99.",
  shipping: "Shipping can't exceed 99,999,999.99.",
  subtotal: "The subtotal can't exceed 99,999,999.99.",
  taxAmount: "The tax amount can't exceed 99,999,999.99.",
  total: "The total can't exceed 99,999,999.99.",
  discount: "Discount can't exceed the subtotal plus shipping.",
};

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe('checkAmountBounds (AC-19)', () => {
  it('1,000 hours at 150,000 on one line refuses the line amount, subtotal and total', () => {
    expect(
      checkAmountBounds({ items: [{ quantity: 1000, price: 150000 }], taxRate: 0, discount: 0, shipping: 0 })
    ).toEqual({ 'items.0.total': [MSG.line], subtotal: [MSG.subtotal], total: [MSG.total] });
  });

  it('a subtotal over the limit is refused even when the discount brings the total under it', () => {
    const result = checkAmountBounds({
      items: [
        { quantity: 1, price: 60_000_000 },
        { quantity: 1, price: 50_000_000 },
      ],
      taxRate: 0,
      discount: 20_000_000,
      shipping: 0,
    });
    expect(result).toEqual({ subtotal: [MSG.subtotal] });
  });

  it('the tax amount is checked on its own', () => {
    const result = checkAmountBounds({
      items: [{ quantity: 1, price: 99_000_000 }],
      taxRate: 100,
      discount: 98_000_000,
      shipping: 0,
    });
    // Tax base 99M + 0 - 98M = 1M, tax 1M, total 2M: nothing over the cap.
    expect(result).toEqual({});
    // Tax base 90M + 90M = 180M at 100 % → a tax amount of 180M, over the cap on its own.
    expect(
      checkAmountBounds({ items: [{ quantity: 1, price: 90_000_000 }], taxRate: 100, discount: 0, shipping: 90_000_000 })
    ).toEqual({ taxAmount: [MSG.taxAmount], total: [MSG.total] });
  });

  it('shipping over the limit is refused on shipping', () => {
    expect(
      checkAmountBounds({ items: [{ quantity: 1, price: 1 }], taxRate: 0, discount: 0, shipping: 100_000_000 })
    ).toEqual({ shipping: [MSG.shipping], total: [MSG.total] });
  });

  it('an amount of exactly 99,999,999.99 is accepted', () => {
    expect(
      checkAmountBounds({ items: [{ quantity: 1, price: 99_999_999.99 }], taxRate: 0, discount: 0, shipping: 0 })
    ).toEqual({});
  });
});

describe('checkDiscountCap (AC-20b)', () => {
  const values = (discount: number) => ({
    items: [{ quantity: 1, price: 1000 }],
    taxRate: 0,
    discount,
    shipping: 200,
  });

  it('refuses 1,250.00 on lines of 1,000.00 plus 200.00 shipping', () => {
    expect(checkDiscountCap(values(1250))).toEqual({ discount: [MSG.discount] });
  });

  it('accepts 1,200.00 (equal to lines plus shipping)', () => {
    expect(checkDiscountCap(values(1200))).toEqual({});
  });

  it('checkDraftAmountRules returns every failing key together', () => {
    expect(
      checkDraftAmountRules({
        items: [{ quantity: 1000, price: 150000 }],
        taxRate: 0,
        discount: 200_000_000,
        shipping: 0,
      })
    ).toEqual({
      'items.0.total': [MSG.line],
      subtotal: [MSG.subtotal],
      discount: [MSG.discount],
    });
  });
});

describe('checkDueDate (AC-09)', () => {
  it('refuses 5 Mar against an issue date of 10 Mar, naming the issue date', () => {
    expect(checkDueDate(day('2026-03-10'), day('2026-03-05'))).toEqual({
      dueDate: ["The due date can't be before the issue date (10 Mar 2026)."],
    });
  });

  it('accepts the same day and a later day', () => {
    expect(checkDueDate(day('2026-03-10'), day('2026-03-10'))).toEqual({});
    expect(checkDueDate(day('2026-03-10'), day('2026-04-01'))).toEqual({});
  });
});

describe('the editor runs the same rules (clientInvoiceFormSchema)', () => {
  const base = {
    invoiceNumber: '',
    status: 'DRAFT',
    senderProfileId: 'sp',
    bankAccountId: 'ba',
    customerId: 'cu',
    issueDate: '2026-03-10',
    dueDate: '2026-03-05',
    currency: 'USD',
    items: [{ id: 'i', productName: 'Work', description: '', unit: 'h', quantity: 1000, price: 150000, total: 0 }],
    taxRate: 0,
    discount: 0,
    shipping: 0,
  };

  it('reports the bounds and the due date', () => {
    const result = clientInvoiceFormSchema.safeParse(base);
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        `items.0.total: ${MSG.line}`,
        `subtotal: ${MSG.subtotal}`,
        `total: ${MSG.total}`,
        "dueDate: The due date can't be before the issue date (10 Mar 2026).",
      ])
    );
  });
});

describe('invoiceUpdateFormSchema — loadedVersion', () => {
  const input = {
    invoiceNumber: '',
    status: 'DRAFT',
    senderProfileId: 'sp',
    bankAccountId: 'ba',
    customerId: 'cu',
    issueDate: '2026-03-10',
    dueDate: '2026-03-20',
    currency: 'USD',
    items: [{ id: 'i', productName: 'Work', description: '', unit: 'h', quantity: 1, price: 10, total: 10 }],
  };

  it.each([undefined, -1, 1.5, '3'])('refuses loadedVersion %s', (loadedVersion) => {
    const result = invoiceUpdateFormSchema.safeParse({ ...input, loadedVersion });
    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.flatten().fieldErrors.loadedVersion).toEqual([
      'Reload the invoice and try again.',
    ]);
  });

  it('accepts an integer ≥ 0', () => {
    const result = invoiceUpdateFormSchema.safeParse({ ...input, loadedVersion: 0 });
    expect(result.success).toBe(true);
    expect(result.success && result.data.loadedVersion).toBe(0);
  });
});

// T23 (review F2, F6; AC-14, AC-19, AC-20b): the update input is the shape only; the per-field
// bounds run on a draft; the discount is capped at the column limit.
describe('T23 amount bounds by status and path', () => {
  const base = {
    senderProfileId: 's',
    bankAccountId: 'b',
    customerId: 'c',
    issueDate: '2026-03-10',
    dueDate: '2026-03-24',
    currency: 'USD',
    loadedVersion: 0,
    items: [{ id: 'i', productName: 'x', unit: 'h', quantity: 1, price: 10, total: 10 }],
    taxRate: 0,
    discount: 0,
    shipping: 0,
  };
  const DISCOUNT_MAX = "Discount can't exceed 99,999,999.99.";

  it('the update parse accepts out-of-range amounts (checked later, on a draft only)', () => {
    const bad = {
      ...base,
      taxRate: -5,
      shipping: -1,
      items: [{ ...base.items[0], quantity: 0, price: -3 }],
    };
    expect(invoiceUpdateFormSchema.safeParse(bad).success).toBe(true);
  });

  it('the update parse still refuses a wrong type', () => {
    const res = invoiceUpdateFormSchema.safeParse({ ...base, taxRate: 'abc' });
    expect(res.success).toBe(false);
  });

  it('a discount above 99,999,999.99 is a discount field error on the shape and on the amounts schema', () => {
    for (const schema of [invoiceShapeSchema, invoiceAmountsSchema]) {
      const res = schema.safeParse({ ...base, discount: 100_000_000 });
      expect(res.success).toBe(false);
      if (!res.success) {
        const msgs = res.error.issues.filter((i) => i.path[0] === 'discount').map((i) => i.message);
        expect(msgs).toContain(DISCOUNT_MAX);
      }
    }
  });

  it('a discount of exactly 99,999,999.99 passes the field bound', () => {
    const res = invoiceShapeSchema.safeParse({ ...base, discount: 99_999_999.99, shipping: 99_999_999.99, items: [{ ...base.items[0], price: 99_999_999.99 }] });
    expect(res.success).toBe(true);
  });
});
