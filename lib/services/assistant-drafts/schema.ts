// Draft request, proposal and issue schemas of the ai-assistant feature, mirroring
// docs/features/ai-assistant/contracts/openapi.yaml one-to-one (ADR-0006: the request carries
// the Freelancer's own words, the resolver alone produces values or issues).
import 'server-only';
import { z } from 'zod';

const recordId = z.string().min(1).max(64);
const currency = z.enum(['UAH', 'USD', 'EUR', 'GBP', 'PLN']);
const decimalString = z.string().regex(/^-?\d+\.\d{2}$/);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amountInput = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/);
const freelancerText = z.object({ freelancerText: z.string() });

// ---------- request ----------
export const draftRequestLineSchema = z
  .object({
    description: z.string().min(1).max(200),
    quantity: amountInput.optional(),
    unit: z.string().max(20).optional(),
    price: amountInput.optional(),
  })
  .strict();

export const draftRequestSchema = z
  .object({
    customer: z.string().min(1).max(200).optional(),
    customerId: recordId.optional(),
    senderProfile: z.string().min(1).max(200).optional(),
    currency: z.string().min(1).max(8).optional(),
    lines: z.array(draftRequestLineSchema).min(1).max(50),
    issueDate: localDate.optional(),
    dueDate: localDate.optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine((v) => (v.customer === undefined) !== (v.customerId === undefined), {
    message: 'Give exactly one of customer and customerId.',
    path: ['customer'],
  });

// An extended refined schema cannot be re-extended, so the repeat mark is added on the base shape.
export const createDraftInvoiceInputSchema = z
  .object({
    customer: z.string().min(1).max(200).optional(),
    customerId: recordId.optional(),
    senderProfile: z.string().min(1).max(200).optional(),
    currency: z.string().min(1).max(8).optional(),
    lines: z.array(draftRequestLineSchema).min(1).max(50),
    issueDate: localDate.optional(),
    dueDate: localDate.optional(),
    notes: z.string().max(2000).optional(),
    repeatKey: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((v) => (v.customer === undefined) !== (v.customerId === undefined), {
    message: 'Give exactly one of customer and customerId.',
    path: ['customer'],
  });

// ---------- proposal ----------
const dated = z.object({ value: localDate, source: z.enum(['REQUEST', 'DEFAULT']) });

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
    total: decimalString,
    invoiceNumber: z.string().nullable().optional(),
    defaultsUsed: z.array(z.string()),
  })
  .strict();

// ---------- issues ----------
const lineIndex = z.number().int().min(0);
const candidates = z
  .array(z.object({ customerId: recordId, name: freelancerText }))
  .max(50);

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
  }),
  z.object({
    kind: z.literal('SEVERAL_ACCOUNTS_IN_CURRENCY'),
    currency,
    accounts: z.array(z.object({ bankAccountId: recordId, label: z.string() })),
  }),
]);

export type DraftRequest = z.infer<typeof draftRequestSchema>;
export type CreateDraftInvoiceInput = z.infer<typeof createDraftInvoiceInputSchema>;
export type DraftProposal = z.infer<typeof draftProposalSchema>;
export type DraftProposalLine = z.infer<typeof draftProposalLineSchema>;
export type DraftIssue = z.infer<typeof draftIssueSchema>;
