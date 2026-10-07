import { z } from 'zod';
import { Currency, InvoiceStatus } from '@prisma/client';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';
import { dayToUtcDate, isCalendarDay, utcDateToDay } from '@/lib/helpers/calendar-day';

// T11 (spec.md §5 AC-14, AC-15, AC-19) — bounds, messages and the discount cap, per
// contracts/server-actions.md §Invoices ("Shared input InvoiceFormValues" and
// "Field-error messages", both verbatim).
const MAX_AMOUNT = 99_999_999.99;

// invoice-integrity T05 (spec.md §5 AC-09, AC-19, AC-20b; contracts/server-actions.md §Field-error
// messages). The business rules as plain functions returning fieldErrors, so the service runs them
// inside its save transaction (on a draft: all of them; on an issued invoice: only the due date) and
// the editor's client schema runs the very same ones.
const MAX_CENTS = BigInt(9_999_999_999);

const AMOUNT_MESSAGES = {
  line: "The line amount can't exceed 99,999,999.99.",
  shipping: "Shipping can't exceed 99,999,999.99.",
  subtotal: "The subtotal can't exceed 99,999,999.99.",
  taxAmount: "The tax amount can't exceed 99,999,999.99.",
  total: "The total can't exceed 99,999,999.99.",
  discount: "Discount can't exceed the subtotal plus shipping.",
} as const;

export type FieldErrors = Record<string, string[]>;

export interface InvoiceAmountRuleValues {
  items: { quantity: number; price: number }[];
  taxRate: number;
  discount: number;
  shipping: number;
}

/** True when a 2-dp decimal string from the shared module is above 99,999,999.99 (exact, no floats). */
function overCap(amount: string): boolean {
  if (!/^-?\d+\.\d{2}$/.test(amount)) return false; // 'NaN' — the type checks report it
  return BigInt(amount.replace('.', '')) > MAX_CENTS;
}

function amountsOf(values: InvoiceAmountRuleValues) {
  return computeInvoiceAmounts({
    items: values.items.map((item) => ({ quantity: item.quantity, price: item.price })),
    discount: values.discount,
    shipping: values.shipping,
    taxRate: values.taxRate,
  });
}

/** AC-19: every computed amount on its own — each line, shipping, subtotal, tax amount, total. */
export function checkAmountBounds(values: InvoiceAmountRuleValues): FieldErrors {
  const amounts = amountsOf(values);
  const errors: FieldErrors = {};
  amounts.items.forEach((item, i) => {
    if (overCap(item.amount)) errors[`items.${i}.total`] = [AMOUNT_MESSAGES.line];
  });
  if (values.shipping > MAX_AMOUNT) errors.shipping = [AMOUNT_MESSAGES.shipping];
  if (overCap(amounts.subtotal)) errors.subtotal = [AMOUNT_MESSAGES.subtotal];
  if (overCap(amounts.taxAmount)) errors.taxAmount = [AMOUNT_MESSAGES.taxAmount];
  if (overCap(amounts.total)) errors.total = [AMOUNT_MESSAGES.total];
  return errors;
}

/**
 * AC-20b: discount ≤ lines + shipping (equal allowed). The shared decimal module with taxRate
 * pinned to 0 turns it into "is subtotal - discount + shipping negative?" — no float math.
 */
export function checkDiscountCap(values: InvoiceAmountRuleValues): FieldErrors {
  const { total } = amountsOf({ ...values, taxRate: 0 });
  return values.discount >= 0 && total.startsWith('-') ? { discount: [AMOUNT_MESSAGES.discount] } : {};
}

/** The amount rules of a draft, every failing key together. */
export function checkDraftAmountRules(values: InvoiceAmountRuleValues): FieldErrors {
  return { ...checkAmountBounds(values), ...checkDiscountCap(values) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A stored calendar day in the app's display format, e.g. "10 Mar 2026". */
function displayDay(date: Date): string {
  const [y, m, d] = utcDateToDay(date).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** AC-09: the due date can't be before the issue date (same day allowed); both are calendar days. */
export function checkDueDate(issueDate: Date, dueDate: Date): FieldErrors {
  return utcDateToDay(dueDate) < utcDateToDay(issueDate)
    ? { dueDate: [`The due date can't be before the issue date (${displayDay(issueDate)}).`] }
    : {};
}

function addFieldErrors(errors: FieldErrors, ctx: z.RefinementCtx) {
  for (const [key, messages] of Object.entries(errors)) {
    for (const message of messages) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: key.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)), message });
    }
  }
}

// F-02: quantity/price/taxRate/discount/shipping map to DECIMAL(_,2) columns, so a value with
// more than 2 decimal places gets rounded differently by the DB than by the shared decimal
// module used to compute the stored total — flagging a brand-new invoice as legacy on its next
// edit (SCR-15). Checked on the string form of the number (JS's Number#toString() round-trips a
// directly-typed decimal literal exactly), never by re-doing the arithmetic in floats.
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  if (!Number.isFinite(value)) return true; // let z.number()'s own type check report NaN/Infinity
  const str = Math.abs(value).toString();
  if (/e/i.test(str)) {
    return Math.abs(value - Math.round(value * 100) / 100) < Number.EPSILON * Math.abs(value || 1);
  }
  const dot = str.indexOf('.');
  return dot === -1 || str.length - dot - 1 <= 2;
}

// T25/T40 (spec.md §1, review-2026-10-05 F-02, r2 H-05): an issue or due date is a calendar day,
// stored as that day at T00:00:00Z. The server (action + service) accepts only `yyyy-MM-dd`; a Date
// would silently keep its UTC day and store the day before for zones east of UTC. The editor's own
// client-side validation (local Dates) uses the client-only variant below.
const calendarDayStringSchema = z
  .string({ errorMap: () => ({ message: 'Invalid date' }) })
  .transform((value, ctx): Date => {
    if (isCalendarDay(value)) return dayToUtcDate(value);
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
    return z.NEVER;
  });

// Client-only, for validity checks in the editor: a Date is reduced to its UTC day (not its local Y/M/D);
// the parsed value is never sent to the server.
const clientCalendarDaySchema = z
  .union([z.string(), z.date()], { errorMap: () => ({ message: 'Invalid date' }) })
  .transform((value, ctx): Date => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return dayToUtcDate(utcDateToDay(value));
    if (typeof value === 'string' && isCalendarDay(value)) return dayToUtcDate(value);
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
    return z.NEVER;
  });

export const invoiceItemSchema = z.object({
  id: z.string(),
  productId: z.string().optional(),
  productName: z.string().min(1, 'Product name is required'),
  description: z.string().optional().default(''),
  unit: z.string().min(1, 'Unit is required'),
  quantity: z.number({ required_error: 'Quantity must be a number.', invalid_type_error: 'Quantity must be a number.' })
    .gt(0, 'Quantity must be greater than zero.')
    .max(MAX_AMOUNT, 'Quantity is too large.')
    .refine(hasAtMostTwoDecimalPlaces, 'Quantity can have at most 2 decimal places.'),
  price: z.number({ required_error: 'Price must be a number.', invalid_type_error: 'Price must be a number.' })
    .min(0, "Price can't be negative.")
    .max(MAX_AMOUNT, 'Price is too large.')
    .refine(hasAtMostTwoDecimalPlaces, 'Price can have at most 2 decimal places.'),
  total: z.number(),
});

function refineDiscountCap(values: InvoiceAmountRuleValues, ctx: z.RefinementCtx) {
  addFieldErrors(checkDiscountCap(values), ctx);
}

const taxRateSchema = z.number({ required_error: 'Tax rate must be a number.', invalid_type_error: 'Tax rate must be a number.' })
  .min(0, 'Tax rate must be between 0 and 100 %.')
  .max(100, 'Tax rate must be between 0 and 100 %.')
  .refine(hasAtMostTwoDecimalPlaces, 'Tax rate can have at most 2 decimal places.')
  .default(0);

const discountSchema = z.number({ required_error: 'Discount must be a number.', invalid_type_error: 'Discount must be a number.' })
  .min(0, "Discount can't be negative.")
  .refine(hasAtMostTwoDecimalPlaces, "Discount can have at most 2 decimal places.")
  .default(0);

const shippingSchema = z.number({ required_error: 'Shipping must be a number.', invalid_type_error: 'Shipping must be a number.' })
  .min(0, "Shipping can't be negative.")
  .max(MAX_AMOUNT, AMOUNT_MESSAGES.shipping)
  .refine(hasAtMostTwoDecimalPlaces, 'Shipping can have at most 2 decimal places.')
  .default(0);

function buildInvoiceFormObject(day: typeof calendarDayStringSchema | typeof clientCalendarDaySchema) {
  return z
  .object({
    // Empty (or whitespace-only) = system-assigned; anything else is manual (AC-06, AC-10).
    invoiceNumber: z.string().trim().default(''),
    status: z.nativeEnum(InvoiceStatus, {
      errorMap: () => ({ message: 'Unknown status.' }),
    }).default('DRAFT'),
    senderProfileId: z.string().min(1, 'Sender profile is required'),
    bankAccountId: z.string().min(1, 'Bank account is required'),
    customerId: z.string().min(1, 'Customer is required'),
    issueDate: day,
    dueDate: day,
    // The stored instants the editor was built from (T44, I-01): only ever compared, never written.
    loadedIssueDate: z.string().datetime().optional(),
    loadedDueDate: z.string().datetime().optional(),
    currency: z.nativeEnum(Currency),
    poNumber: z.string().optional().default(''),
    paymentTerms: z.string().optional().default(''),
    items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
    taxRate: taxRateSchema,
    discount: discountSchema,
    shipping: shippingSchema,
    notes: z.string().optional().default(''),
    terms: z.string().optional().default(''),
    // Update only (AC-17); optional here since this schema is shared by create/update.
    confirmedTotals: z
      .object({ oldTotal: z.string(), newTotal: z.string() })
      .optional(),
  });
}

export const invoiceFormSchema = buildInvoiceFormObject(calendarDayStringSchema).superRefine(refineDiscountCap);

/**
 * The shape only (types, enums, calendar days, per-field bounds), without the business rules: the
 * create path runs those as plain functions after the status and ownership checks (contract order).
 */
export const invoiceShapeSchema = buildInvoiceFormObject(calendarDayStringSchema);

/**
 * updateInvoice's input (AC-10): the editor sends back the version it loaded. Required, an
 * integer ≥ 0; createInvoice ignores it.
 */
const RELOAD_MESSAGE = 'Reload the invoice and try again.';
export const invoiceUpdateFormSchema = buildInvoiceFormObject(calendarDayStringSchema)
  .extend({
    loadedVersion: z
      .number({ required_error: RELOAD_MESSAGE, invalid_type_error: RELOAD_MESSAGE })
      .int(RELOAD_MESSAGE)
      .min(0, RELOAD_MESSAGE),
  })
  .superRefine(refineDiscountCap);

/** Client-only (editor validation of local Dates); never used by the server. Runs every draft rule. */
export const clientInvoiceFormSchema = buildInvoiceFormObject(clientCalendarDaySchema).superRefine(
  (values, ctx) => {
    addFieldErrors(checkDraftAmountRules(values), ctx);
    addFieldErrors(checkDueDate(values.issueDate, values.dueDate), ctx);
  }
);

// N-07: duplicateInvoice checks only the amount rules (quantity, price, tax, discount, shipping and
// the discount cap) — name/unit/relations of a legacy source have nothing to do with a copy.
export const invoiceAmountsSchema = z
  .object({
    items: z.array(invoiceItemSchema.pick({ quantity: true, price: true })).min(1, 'At least one item is required'),
    taxRate: taxRateSchema,
    discount: discountSchema,
    shipping: shippingSchema,
  })
  .superRefine(refineDiscountCap);

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
/** What a caller sends: the days are `yyyy-MM-dd`, parsed into `InvoiceFormValues`. */
export type InvoiceFormInput = z.input<typeof invoiceFormSchema>;
export type InvoiceUpdateFormValues = z.infer<typeof invoiceUpdateFormSchema>;
export type InvoiceUpdateFormInput = z.input<typeof invoiceUpdateFormSchema>;
export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>;
