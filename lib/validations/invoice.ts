import { z } from 'zod';
import { Currency, InvoiceStatus } from '@prisma/client';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';

// T11 (spec.md §5 AC-14, AC-15, AC-19) — bounds, messages and the discount cap, per
// contracts/server-actions.md §Invoices ("Shared input InvoiceFormValues" and
// "Field-error messages", both verbatim).
const MAX_AMOUNT = 99_999_999.99;

export const invoiceItemSchema = z.object({
  id: z.string(),
  productId: z.string().optional(),
  productName: z.string().min(1, 'Product name is required'),
  description: z.string().optional().default(''),
  unit: z.string().min(1, 'Unit is required'),
  quantity: z
    .number()
    .gt(0, 'Quantity must be greater than zero.')
    .max(MAX_AMOUNT, 'Quantity is too large.'),
  price: z
    .number()
    .min(0, "Price can't be negative.")
    .max(MAX_AMOUNT, 'Price is too large.'),
  total: z.number(),
});

export const invoiceFormSchema = z
  .object({
    // Empty (or whitespace-only) = system-assigned; anything else is manual (AC-06, AC-10).
    invoiceNumber: z.string().trim().default(''),
    status: z.nativeEnum(InvoiceStatus, {
      errorMap: () => ({ message: 'Unknown status.' }),
    }).default('DRAFT'),
    senderProfileId: z.string().min(1, 'Sender profile is required'),
    bankAccountId: z.string().min(1, 'Bank account is required'),
    customerId: z.string().min(1, 'Customer is required'),
    issueDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    currency: z.nativeEnum(Currency),
    poNumber: z.string().optional().default(''),
    paymentTerms: z.string().optional().default(''),
    items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
    taxRate: z
      .number()
      .min(0, 'Tax rate must be between 0 and 100 %.')
      .max(100, 'Tax rate must be between 0 and 100 %.')
      .default(0),
    discount: z.number().min(0, "Discount can't be negative.").default(0),
    shipping: z
      .number()
      .min(0, "Shipping can't be negative.")
      .max(MAX_AMOUNT, "Shipping can't exceed the maximum amount.")
      .default(0),
    notes: z.string().optional().default(''),
    terms: z.string().optional().default(''),
    // Update only (AC-17); optional here since this schema is shared by create/update.
    confirmedTotals: z
      .object({ oldTotal: z.string(), newTotal: z.string() })
      .optional(),
  })
  .superRefine((values, ctx) => {
    // Discount must not exceed subtotal + shipping (AC-15). Reusing T10's exact-decimal module
    // with taxRate pinned to 0 turns the check into "is (subtotal - discount + shipping)
    // negative?" — computeInvoiceAmounts's `total` field, formatted by the same module that
    // stores amounts, so no float math is done here.
    const amounts = computeInvoiceAmounts({
      items: values.items.map((item) => ({ quantity: item.quantity, price: item.price })),
      discount: values.discount,
      shipping: values.shipping,
      taxRate: 0,
    });

    if (values.discount >= 0 && amounts.total.startsWith('-')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discount'],
        message: "Discount can't exceed the subtotal plus shipping.",
      });
    }
  });

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>;
