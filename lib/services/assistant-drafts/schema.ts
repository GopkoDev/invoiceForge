// Draft request, proposal and issue schemas of the ai-assistant feature, mirroring
// docs/features/ai-assistant/contracts/openapi.yaml one-to-one (ADR-0006: the request carries
// the Freelancer's own words, the resolver alone produces values or issues).
import 'server-only';
import { z } from 'zod';
import { isCalendarDay } from '@/lib/helpers/calendar-day';

const recordId = z.string().min(1).max(64);
const currency = z.enum(['UAH', 'USD', 'EUR', 'GBP', 'PLN']);
const decimalString = z.string().regex(/^-?\d+\.\d{2}$/);
// A real calendar day: 2026-02-30 is refused here, never reaching the resolver or the invoice.
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDay, 'Not a calendar day.');
const amountInput = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/);
const freelancerText = z.object({ freelancerText: z.string() });

// ---------- request ----------
export const draftRequestLineSchema = z
  .object({
    description: z.string().min(1).max(200),
    productId: recordId.optional().describe('The exact catalogue product found through the read tools, instead of a name match.'),
    quantity: amountInput.optional(),
    unit: z.string().max(20).optional(),
    price: amountInput.optional(),
  })
  // The words the model reads when it puts another key, typically `currency`, in a line (fix 2026-10-12).
  .strict('A line takes only description, productId, quantity, unit and price. Pass currency once for the whole request, never in a line.');

// spec.md §1 "What a request may set": every field the editor has. The invoice domain's rules (tax 0-100 %,
// discount cap, amount bounds, due >= issue) are checked by the resolver, which reuses the editor's own.
const draftRequestShape = {
  customer: z.string().min(1).max(200).optional(),
  customerId: recordId.optional(),
  senderProfile: z.string().min(1).max(200).optional(),
  bankAccount: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("The bank account as written (its bank name, account name or last digits) or its id; matched within the sender profile."),
  currency: z.string().min(1).max(8).optional(),
  lines: z.array(draftRequestLineSchema).min(1).max(50),
  issueDate: localDate.optional(),
  dueDate: localDate.optional(),
  taxRate: amountInput.optional().describe('Tax rate in percent, as written, e.g. "20".'),
  discount: amountInput.optional().describe('Discount amount in the invoice currency.'),
  shipping: amountInput.optional().describe('Shipping amount in the invoice currency.'),
  poNumber: z.string().max(100).optional(),
  paymentTerms: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(2000).optional(),
};

const oneCustomer = (v: { customer?: string; customerId?: string }) =>
  (v.customer === undefined) !== (v.customerId === undefined);
const ONE_CUSTOMER = { message: 'Give exactly one of customer and customerId.', path: ['customer'] };

export const draftRequestSchema = z.object(draftRequestShape).strict().refine(oneCustomer, ONE_CUSTOMER);

export const createDraftInvoiceInputSchema = z
  .object({ ...draftRequestShape, repeatKey: z.string().min(1).max(200).optional() })
  .strict()
  .refine(oneCustomer, ONE_CUSTOMER);

// ---------- proposal ----------
const dated = z.object({ value: localDate, source: z.enum(['REQUEST', 'DEFAULT']) });
// A value only the request sets (spec.md §1); absent = the editor's default (no tax, discount or shipping, empty text).
const requested = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, source: z.literal('REQUEST') }).strict().optional();

export const draftProposalLineSchema = z
  .object({
    name: z.string(),
    productId: recordId.nullable(),
    quantity: decimalString,
    unit: z.string(),
    rate: decimalString,
    amount: decimalString,
    quantitySource: z.enum(['REQUEST', 'DEFAULT']),
    unitSource: z.enum(['REQUEST', 'CATALOGUE', 'DEFAULT']),
    rateSource: z.enum(['REQUEST', 'CUSTOM_PRICE', 'CATALOGUE']),
    agreedCustomPrice: decimalString.nullable().optional(),
  })
  .strict();

export const draftProposalSchema = z
  .object({
    customer: z.object({
      customerId: recordId,
      name: freelancerText,
      source: z.literal('REQUEST'),
    }),
    senderProfile: z.object({
      senderProfileId: recordId,
      name: freelancerText,
      source: z.enum(['REQUEST', 'DEFAULT']),
    }),
    bankAccount: z.object({
      bankAccountId: recordId,
      label: z.string(),
      currency,
      source: z.enum(['DEFAULT', 'REQUEST']),
    }),
    currency,
    issueDate: dated,
    dueDate: dated,
    lines: z.array(draftProposalLineSchema).min(1).max(50),
    subtotal: decimalString,
    taxRate: requested(decimalString),
    taxAmount: decimalString.optional(),
    discount: requested(decimalString),
    shipping: requested(decimalString),
    total: decimalString,
    poNumber: requested(z.string()),
    paymentTerms: requested(z.string()),
    notes: requested(z.string()),
    terms: requested(z.string()),
    invoiceNumber: z.string().nullable().optional(),
    defaultsUsed: z.array(z.string()),
  })
  .strict();

// ---------- issues ----------
const lineIndex = z.number().int().min(0);
const candidates = z
  .array(z.object({ customerId: recordId, name: freelancerText }))
  .max(50);
const productCandidates = z
  .array(z.object({ productId: recordId, name: freelancerText }))
  .max(50);
const accounts = z.array(z.object({ bankAccountId: recordId, label: z.string() }));
const accountInCurrency = z.object({ bankAccountId: recordId, label: z.string(), currency });

export const draftIssueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NO_SENDER_PROFILE_WITH_ACCOUNT') }),
  z.object({
    kind: z.literal('DEFAULT_PROFILE_WITHOUT_ACCOUNT'),
    defaultSenderProfileId: recordId,
    otherProfiles: z.array(z.object({ senderProfileId: recordId, name: freelancerText })),
  }),
  z.object({ kind: z.literal('CUSTOMER_NOT_FOUND'), written: z.string() }),
  z.object({ kind: z.literal('CUSTOMER_AMBIGUOUS'), written: z.string(), candidates }),
  z.object({ kind: z.literal('CUSTOMER_NEAR_MISS'), written: z.string(), candidates }),
  z.object({ kind: z.literal('LINE_AMOUNT_MISSING'), lineIndex, description: z.string() }),
  z.object({ kind: z.literal('LINE_PRICE_MISSING_IN_CURRENCY'), lineIndex, currency }),
  z.object({
    kind: z.literal('CURRENCY_UNCLEAR'),
    written: z.string(),
    options: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('SENDER_PROFILE_NOT_FOUND'),
    written: z.string(),
    options: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('NO_ACCOUNT_IN_CURRENCY'),
    currency,
    senderProfileId: recordId,
    // The accounts the profile does have, so the chat can say which currencies are available.
    accounts: z.array(accountInCurrency),
  }),
  z.object({ kind: z.literal('SEVERAL_ACCOUNTS_IN_CURRENCY'), currency, accounts }),
  z.object({ kind: z.literal('BANK_ACCOUNT_NOT_FOUND'), written: z.string(), accounts }),
  z.object({ kind: z.literal('BANK_ACCOUNT_AMBIGUOUS'), written: z.string(), accounts }),
  // The named account exists but is in another currency than the one asked for: an invoice and its account share one.
  z.object({
    kind: z.literal('BANK_ACCOUNT_CURRENCY_MISMATCH'),
    written: z.string(),
    currency,
    senderProfileId: recordId,
    account: accountInCurrency,
  }),
  z.object({ kind: z.literal('LINE_QUANTITY_MISSING'), lineIndex, description: z.string() }),
  z.object({
    kind: z.literal('PRODUCT_AMBIGUOUS'),
    lineIndex,
    written: z.string(),
    candidates: productCandidates,
  }),
  z.object({ kind: z.literal('PRODUCT_NOT_FOUND'), lineIndex, written: z.string() }),
  z.object({ kind: z.literal('FIELD_INVALID'), field: z.string(), message: z.string() }),
]);

export type DraftRequest = z.infer<typeof draftRequestSchema>;
export type CreateDraftInvoiceInput = z.infer<typeof createDraftInvoiceInputSchema>;
export type DraftProposal = z.infer<typeof draftProposalSchema>;
export type DraftProposalLine = z.infer<typeof draftProposalLineSchema>;
export type DraftIssue = z.infer<typeof draftIssueSchema>;
