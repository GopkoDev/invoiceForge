import 'server-only';
import { z } from 'zod';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import type {
  InvoiceFilterOptions,
  InvoiceListItem,
  SerializedInvoice,
} from '@/types/invoice/types';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import {
  failed,
  isUniqueConstraintError,
  zodValidationFailure,
} from '@/lib/services/_shared/result-helpers';
import {
  escapeLike,
  listQuerySchema,
  paginate,
  type Page,
} from '@/lib/services/_shared/list-query';
import { localDayRange } from '@/lib/services/_shared/time-zone';
import {
  transformInvoiceToFormData,
  buildBankAccountSnapshot,
  buildCustomerSnapshot,
  buildSenderSnapshot,
  computeInvoiceLegacyInfo,
  serializeDecimal,
  serializeInvoice,
  verifyInvoiceRelations,
  verifyItemProductsOwnership,
} from '@/lib/services/invoices/helpers';
import { invoiceListSelect } from '@/lib/services/invoices/select-queries';
import { captureMessage } from '@sentry/nextjs';
import { invoiceAmountsSchema, invoiceFormSchema, type InvoiceFormValues } from '@/lib/validations/invoice';
import { applyStatusChange } from '@/lib/helpers/invoice-status';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';
import {
  allocateInvoiceNumber,
  isInvoiceKeyTaken,
  lockSenderProfileRow,
  normalizeInvoiceNumber,
  peekNextInvoiceNumber as peekNextNumber,
} from '@/lib/services/invoices/numbering';
import { SenderProfileNotFoundError } from '@/lib/services/invoices/numbering-errors';

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

const PROFILE_NOT_FOUND = 'Sender profile not found.';

export async function getInvoice(
  actor: ActingFreelancer,
  id: string
): Promise<ActionResult<SerializedInvoice>> {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: actor.userId } },
      include: {
        items: true,
        senderProfile: true,
        customer: true,
        bankAccount: true,
      },
    });
    if (!invoice) return fail('NOT_FOUND', 'Invoice not found.');

    const serialized = serializeInvoice(invoice);
    if (!serialized) {
      return failed(
        'Invoice serialize failed:',
        new Error(`Invoice ${id} could not be serialized`),
        'Failed to serialize invoice.'
      );
    }

    // AC-17's legacy flags (contracts/server-actions.md §getInvoiceEditorData / getInvoice).
    const legacy = await computeInvoiceLegacyInfo(prisma, invoice);
    return ok({ ...serialized, legacy });
  } catch (error) {
    return failed('Error fetching invoice:', error, 'Failed to fetch invoice.');
  }
}

/** The next proposed invoice number as a hint only (AC-06): no lock, no side effect. */
export async function peekNextInvoiceNumber(
  actor: ActingFreelancer,
  senderProfileId: string
): Promise<ActionResult<string>> {
  try {
    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: actor.userId },
      select: { id: true },
    });
    if (!profile) return fail('NOT_FOUND', PROFILE_NOT_FOUND);

    const invoiceNumber = await peekNextNumber(senderProfileId, actor.userId);
    if (invoiceNumber === null) return fail('NOT_FOUND', PROFILE_NOT_FOUND);
    return ok(invoiceNumber);
  } catch (error) {
    return failed(
      'Error generating invoice number:',
      error,
      'Failed to generate invoice number.'
    );
  }
}

const STATUS_MESSAGE = 'Unknown status.';
const DATE_MESSAGE =
  'Give both dates as YYYY-MM-DD, with the start on or before the end.';
const SORT_FIELDS = [
  'createdAt',
  'issueDate',
  'dueDate',
  'total',
  'invoiceNumber',
] as const;

const localDate = z.string({ message: DATE_MESSAGE }).refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}, DATE_MESSAGE);

export const invoiceListQuerySchema = listQuerySchema
  .extend({
    status: z
      .union([z.literal('all'), z.nativeEnum(InvoiceStatus)], {
        errorMap: () => ({ message: STATUS_MESSAGE }),
      })
      .optional(),
    tab: z
      .enum(['all', 'drafts', 'final'], {
        message: 'Unknown tab. Allowed: all, drafts, final.',
      })
      .optional(),
    customerId: z.string().optional(),
    senderProfileId: z.string().optional(),
    dateFrom: localDate.optional(),
    dateTo: localDate.optional(),
    sortField: z
      .enum(SORT_FIELDS, {
        message: `Unknown sort option. Allowed: ${SORT_FIELDS.join(', ')}.`,
      })
      .optional(),
    sortDirection: z
      .enum(['asc', 'desc'], {
        message: 'Unknown sort direction. Allowed: asc, desc.',
      })
      .optional(),
  })
  .superRefine((query, ctx) => {
    const { dateFrom, dateTo } = query;
    if ((dateFrom === undefined) !== (dateTo === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [dateFrom === undefined ? 'dateTo' : 'dateFrom'],
        message: DATE_MESSAGE,
      });
    } else if (
      dateFrom !== undefined &&
      dateTo !== undefined &&
      dateFrom > dateTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateFrom'],
        message: DATE_MESSAGE,
      });
    }
  });

export type InvoiceListQuery = z.input<typeof invoiceListQuerySchema>;

export type InvoicePage = Page<InvoiceListItem> & {
  filterOptions: InvoiceFilterOptions;
  totalInvoices: number;
};

/** The invoices list: validated filters, local-date bounds in the actor's zone, owner-scoped (AC-26). */
export async function listInvoices(
  actor: ActingFreelancer,
  rawQuery: InvoiceListQuery = {}
): Promise<ActionResult<InvoicePage>> {
  const parsed = invoiceListQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success)
    return zodValidationFailure(parsed.error, 'Invalid invoice list request.');
  const query = parsed.data;
  const {
    tab = 'all',
    status = 'all',
    sortField = 'createdAt',
    sortDirection = 'desc',
    search,
    customerId,
    senderProfileId,
    dateFrom,
    dateTo,
  } = query;

  try {
    const baseWhere: Prisma.InvoiceWhereInput = {
      senderProfile: { userId: actor.userId },
    };
    const where: Prisma.InvoiceWhereInput = { ...baseWhere };

    // The tab wins over the status filter, which applies on the all tab only (as the page does).
    if (tab === 'drafts') where.status = 'DRAFT';
    else if (tab === 'final') where.status = { not: 'DRAFT' };
    else if (status !== 'all') where.status = status;

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: escapeLike(search), mode: 'insensitive' } },
        { customerName: { contains: escapeLike(search), mode: 'insensitive' } },
        { senderName: { contains: escapeLike(search), mode: 'insensitive' } },
      ];
    }
    if (customerId) where.customerId = customerId;
    if (senderProfileId) where.senderProfileId = senderProfileId;
    if (dateFrom && dateTo) {
      const [gte, lt] = localDayRange(dateFrom, dateTo, actor.timeZone);
      where.issueDate = { gte, lt };
    }

    // The page is read first: a synchronous throw while building the sibling queries must not
    // orphan an in-flight page promise.
    const page = await paginate({
      count: () => prisma.invoice.count({ where }),
      findMany: (args) =>
        prisma.invoice.findMany({
          where,
          select: invoiceListSelect,
          ...args,
          orderBy: args.orderBy as Prisma.InvoiceOrderByWithRelationInput[],
        }),
      orderBy: [{ [sortField]: sortDirection }],
      query,
    });
    const [totalInvoices, customers, senderProfiles] = await Promise.all([
      prisma.invoice.count({ where: baseWhere }),
      prisma.customer.findMany({
        where: { userId: actor.userId },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.senderProfile.findMany({
        where: { userId: actor.userId },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return ok({
      ...page,
      items: page.items.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
      filterOptions: { customers, senderProfiles },
      totalInvoices,
    });
  } catch (error) {
    return failed(
      'Error fetching invoices:',
      error,
      'Failed to fetch invoices.'
    );
  }
}

/** SavedInvoice (contracts/server-actions.md §createInvoice, verbatim): the final saved figures,
 * numbers as `number` (not Decimal/string), `paidAt` as an ISO string or null. */
export type SavedInvoice = {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: InvoiceStatus;
  paidAt: string | null;
};

const INVOICE_NUMBER_CONFLICT_MESSAGE =
  'This invoice number is already used in this sender profile.';

/** Thrown inside the save transaction when a manually typed number's normalized key is already
 * taken (AC-08), so the transaction rolls back before reaching the catch block that turns it into
 * the CONFLICT outcome. */
export class InvoiceNumberConflictError extends Error {}

export function invoiceNumberConflict(): ActionResult<never> {
  return fail('CONFLICT', INVOICE_NUMBER_CONFLICT_MESSAGE, {
    fieldErrors: { invoiceNumber: [INVOICE_NUMBER_CONFLICT_MESSAGE] },
  });
}

// The manual-number rules shared by createInvoice and updateInvoice (contracts/server-actions.md
// §createInvoice number table, §updateInvoice step 2/3, verbatim): empty allocates under the row
// lock (AC-06, AC-07, AC-09); typed keeps it if free, else rolls the transaction back (AC-08, AC-10).
export async function resolveManualOrAllocatedNumber(
  tx: Prisma.TransactionClient,
  senderProfileId: string,
  userId: string,
  invoiceNumber: string,
  excludeInvoiceId?: string
): Promise<{ invoiceNumber: string; invoiceNumberKey: string; wasAllocated: boolean }> {
  if (invoiceNumber === '') {
    const allocated = await allocateInvoiceNumber(tx, senderProfileId, userId);
    return { ...allocated, wasAllocated: true };
  }

  // F-10: take the same row lock the allocator does, so a manual save and a concurrent
  // allocation for the same profile always serialize instead of racing — otherwise both can pass
  // this check before either commits, and the loser surfaces as a raw P2002 (wrongly alerting the
  // allocator-bug backstop below when the loser happened to be system-assigned).
  await lockSenderProfileRow(tx, senderProfileId, userId);

  const invoiceNumberKey = normalizeInvoiceNumber(invoiceNumber);
  if (await isInvoiceKeyTaken(tx, senderProfileId, invoiceNumberKey, excludeInvoiceId)) {
    throw new InvoiceNumberConflictError();
  }
  return { invoiceNumber, invoiceNumberKey, wasAllocated: false };
}


export async function createInvoice(
  actor: ActingFreelancer,
  data: InvoiceFormValues
): Promise<ActionResult<SavedInvoice>> {
  // Set inside the transaction when the number was system-assigned, so the P2002 backstop below
  // knows whether to alert Sentry (checklist: only for system-assigned numbers).
  let wasAllocated = false;
  let allocatedNumber = '';

  try {
    const { userId } = actor;
    const parsed = invoiceFormSchema.safeParse(data);
    if (!parsed.success) {
      return zodValidationFailure(parsed.error);
    }
    const validatedData = parsed.data;

    // Verify ownership and get snapshot data
    const relationsResult = await verifyInvoiceRelations(
      userId,
      validatedData.senderProfileId,
      validatedData.customerId,
      validatedData.bankAccountId
    );
    if (!relationsResult.success) {
      return relationsResult;
    }

    // F-48: every item's productId, if any, must belong to this same Freelancer.
    const productOwnershipResult = await verifyItemProductsOwnership(
      userId,
      validatedData.items
    );
    if (!productOwnershipResult.success) {
      return productOwnershipResult;
    }

    const { senderProfile, customer, bankAccount } = relationsResult.data;

    const invoice = await prisma.$transaction(async (tx) => {
      const resolved = await resolveManualOrAllocatedNumber(
        tx,
        senderProfile.id,
        userId,
        validatedData.invoiceNumber
      );
      const { invoiceNumber, invoiceNumberKey } = resolved;
      wasAllocated = resolved.wasAllocated;
      allocatedNumber = invoiceNumber;

      // Stored amounts come only from the shared exact-decimal module (ADR-0006); whatever the
      // browser sent for items[].total/subtotal/etc. is ignored (AC-13).
      const amounts = computeInvoiceAmounts({
        items: validatedData.items.map((item) => ({
          quantity: item.quantity,
          price: item.price,
        })),
        discount: validatedData.discount,
        shipping: validatedData.shipping,
        taxRate: validatedData.taxRate,
      });

      const { status, paidAt } = applyStatusChange(
        { status: 'DRAFT', paidAt: null },
        validatedData.status
      );

      return tx.invoice.create({
        data: {
          invoiceNumber,
          invoiceNumberKey,
          senderProfileId: validatedData.senderProfileId,
          customerId: validatedData.customerId,
          bankAccountId: validatedData.bankAccountId,
          issueDate: validatedData.issueDate,
          dueDate: validatedData.dueDate,
          paymentTerms: validatedData.paymentTerms,
          status,
          paidAt,
          currency: validatedData.currency,
          poNumber: validatedData.poNumber,
          ...buildSenderSnapshot(senderProfile),
          ...buildCustomerSnapshot(customer),
          ...buildBankAccountSnapshot(bankAccount),
          subtotal: amounts.subtotal,
          taxRate: validatedData.taxRate,
          taxAmount: amounts.taxAmount,
          discount: validatedData.discount,
          shipping: validatedData.shipping,
          total: amounts.total,
          notes: validatedData.notes,
          terms: validatedData.terms,
          items: {
            create: validatedData.items.map((item, index) => ({
              productId:
                item.productId && item.productId !== 'custom'
                  ? item.productId
                  : null,
              name: item.productName,
              description: item.description || null,
              unit: item.unit,
              quantity: item.quantity,
              rate: item.price,
              amount: amounts.items[index].amount,
            })),
          },
        },
      });
    });

    return ok({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
      status: invoice.status,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    if (error instanceof SenderProfileNotFoundError) {
      return fail('NOT_FOUND', PROFILE_NOT_FOUND);
    }
    if (error instanceof InvoiceNumberConflictError || isUniqueConstraintError(error)) {
      // Allocator bug backstop (sad §7): a unique violation on a system-assigned number still
      // shouldn't happen past the row lock — alert so it's investigated.
      if (wasAllocated) {
        // Ids, the number and the flag only — never the form body (sad.md:746).
        captureMessage('invoice_number_conflict', {
          extra: {
            senderProfileId: data.senderProfileId,
            invoiceNumber: allocatedNumber,
            wasAllocated,
          },
        });
      }
      return invoiceNumberConflict();
    }
    return failed('Error creating invoice:', error, 'Failed to create invoice.');
  }
}

const LEGACY_SHARED_NUMBER_MESSAGE =
  'This invoice number is also used by another invoice. Change it to a free one to save.';

/** Thrown inside updateInvoice's transaction for AC-17's shared-number case (step 4): the
 * invoice's own key is NULL or shared, and the submitted number is unchanged. */
class InvoiceLegacySharedNumberError extends Error {}

/** Thrown inside updateInvoice's transaction for AC-17's totals case (step 5): the stored total
 * disagrees with a recompute of the invoice's own stored lines, and confirmedTotals doesn't (yet)
 * echo the current (stored, recomputed) pair. */
class InvoiceTotalsChangedError extends Error {
  constructor(
    public readonly oldTotal: string,
    public readonly newTotal: string
  ) {
    super('TOTALS_CHANGED');
  }
}

// Update an existing invoice (Flows 2, 6 move, 7 legacy, 8 status from the editor). The checks
// run in the order fixed by contracts/server-actions.md §updateInvoice, verbatim: UNAUTHORIZED ->
// VALIDATION (schema) -> NOT_FOUND (invoice, or new relations not owned) -> the move/manual number
// rules (AC-11) -> the legacy shared-number check (AC-17) -> the legacy totals confirmation
// (AC-17) -> applyStatusChange (AC-18, AC-19), all inside one transaction.
export async function updateInvoice(
  actor: ActingFreelancer,
  id: string,
  data: InvoiceFormValues
): Promise<ActionResult<SavedInvoice>> {
  // Set inside the transaction when the number was system-assigned, so the P2002 backstop below
  // knows whether to alert Sentry (checklist: only for system-assigned numbers).
  let wasAllocated = false;
  let allocatedNumber = '';

  try {
    const { userId } = actor;
    const parsed = invoiceFormSchema.safeParse(data);
    if (!parsed.success) {
      return zodValidationFailure(parsed.error);
    }
    const validatedData = parsed.data;

    // Verify invoice exists and belongs to the caller
    const existingInvoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId } },
      include: { items: true },
    });
    if (!existingInvoice) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }

    // Verify ownership and get snapshot data for the (possibly new) relations
    const relationsResult = await verifyInvoiceRelations(
      userId,
      validatedData.senderProfileId,
      validatedData.customerId,
      validatedData.bankAccountId
    );
    if (!relationsResult.success) {
      return relationsResult;
    }

    // F-48: every item's productId, if any, must belong to this same Freelancer.
    const productOwnershipResult = await verifyItemProductsOwnership(
      userId,
      validatedData.items
    );
    if (!productOwnershipResult.success) {
      return productOwnershipResult;
    }

    const { senderProfile, customer, bankAccount } = relationsResult.data;
    const moved = validatedData.senderProfileId !== existingInvoice.senderProfileId;

    const invoice = await prisma.$transaction(async (tx) => {
      // Step 2/3 (AC-11) + Step 4 (AC-17), folded into one "is the number unchanged" branch: a
      // move clears the number field and always applies the manual/allocate rules under B; an
      // unmoved, unchanged number instead runs the legacy shared-number check, and only when
      // it's free does it keep the number; a changed, non-empty number falls through to the same manual rules (AC-08,
      // AC-10). A's counter is never touched either way.
      const numberUnchanged =
        !moved &&
        validatedData.invoiceNumber !== '' &&
        normalizeInvoiceNumber(validatedData.invoiceNumber) ===
          normalizeInvoiceNumber(existingInvoice.invoiceNumber);

      let resolvedNumber: { invoiceNumber: string; invoiceNumberKey: string; wasAllocated: boolean };
      if (numberUnchanged) {
        const effectiveKey = existingInvoice.invoiceNumberKey;
        const sharedNumber = await isInvoiceKeyTaken(
          tx,
          existingInvoice.senderProfileId,
          effectiveKey,
          existingInvoice.id
        );
        if (sharedNumber) {
          throw new InvoiceLegacySharedNumberError();
        }
        resolvedNumber = {
          invoiceNumber: existingInvoice.invoiceNumber,
          invoiceNumberKey: effectiveKey,
          wasAllocated: false,
        };
      } else {
        resolvedNumber = await resolveManualOrAllocatedNumber(
          tx,
          validatedData.senderProfileId,
          userId,
          validatedData.invoiceNumber,
          existingInvoice.id
        );
      }
      const { invoiceNumber, invoiceNumberKey } = resolvedNumber;
      wasAllocated = resolvedNumber.wasAllocated;
      allocatedNumber = invoiceNumber;

      // Stored amounts come only from the shared exact-decimal module (ADR-0006); whatever the
      // browser sent for items[].total/subtotal/etc. is ignored (AC-13).
      const amounts = computeInvoiceAmounts({
        items: validatedData.items.map((item) => ({
          quantity: item.quantity,
          price: item.price,
        })),
        discount: validatedData.discount,
        shipping: validatedData.shipping,
        taxRate: validatedData.taxRate,
      });

      // Step 5 (AC-17, flow 7): the invoice is legacy-by-totals when a recompute of its own
      // stored lines disagrees with its stored total. Only then does a mismatch against the
      // freshly submitted amounts need confirmedTotals to echo (stored, recomputed) exactly.
      const existingRecomputed = computeInvoiceAmounts({
        items: existingInvoice.items.map((item) => ({
          quantity: item.quantity.toString(),
          price: item.rate.toString(),
        })),
        discount: existingInvoice.discount.toString(),
        shipping: existingInvoice.shipping.toString(),
        taxRate: existingInvoice.taxRate.toString(),
      });
      const storedTotal = existingInvoice.total.toFixed(2);
      const isLegacyTotals = storedTotal !== existingRecomputed.total;

      if (isLegacyTotals) {
        const newTotal = amounts.total;
        const confirmed = validatedData.confirmedTotals;
        const confirmedMatches =
          confirmed !== undefined &&
          confirmed.oldTotal === storedTotal &&
          confirmed.newTotal === newTotal;
        if (!confirmedMatches) {
          throw new InvoiceTotalsChangedError(storedTotal, newTotal);
        }
      }

      // Step 6 (AC-18, AC-19): the one status/paid-date transition function.
      const { status, paidAt } = applyStatusChange(
        { status: existingInvoice.status, paidAt: existingInvoice.paidAt },
        validatedData.status
      );

      await tx.invoiceItem.deleteMany({
        where: { invoiceId: id, invoice: { senderProfile: { userId } } },
      });

      return tx.invoice.update({
        where: { id, senderProfile: { userId } },
        data: {
          invoiceNumber,
          invoiceNumberKey,
          senderProfileId: validatedData.senderProfileId,
          customerId: validatedData.customerId,
          bankAccountId: validatedData.bankAccountId,
          issueDate: validatedData.issueDate,
          dueDate: validatedData.dueDate,
          paymentTerms: validatedData.paymentTerms,
          status,
          paidAt,
          currency: validatedData.currency,
          poNumber: validatedData.poNumber,
          ...buildSenderSnapshot(senderProfile),
          ...buildCustomerSnapshot(customer),
          ...buildBankAccountSnapshot(bankAccount),
          subtotal: amounts.subtotal,
          taxRate: validatedData.taxRate,
          taxAmount: amounts.taxAmount,
          discount: validatedData.discount,
          shipping: validatedData.shipping,
          total: amounts.total,
          notes: validatedData.notes,
          terms: validatedData.terms,
          items: {
            create: validatedData.items.map((item, index) => ({
              productId:
                item.productId && item.productId !== 'custom'
                  ? item.productId
                  : null,
              name: item.productName,
              description: item.description || null,
              unit: item.unit,
              quantity: item.quantity,
              rate: item.price,
              amount: amounts.items[index].amount,
            })),
          },
        },
      });
    });

    return ok({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
      status: invoice.status,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    if (error instanceof InvoiceLegacySharedNumberError) {
      return fail('CONFLICT', LEGACY_SHARED_NUMBER_MESSAGE, {
        fieldErrors: { invoiceNumber: [LEGACY_SHARED_NUMBER_MESSAGE] },
      });
    }
    if (error instanceof InvoiceTotalsChangedError) {
      const message = `The total of this invoice changes from ${error.oldTotal} to ${error.newTotal}. Confirm to save.`;
      return fail('CONFLICT', message, {
        details: { kind: 'TOTALS_CHANGED', oldTotal: error.oldTotal, newTotal: error.newTotal },
      });
    }
    if (isRecordNotFoundError(error)) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }
    if (error instanceof SenderProfileNotFoundError) {
      return fail('NOT_FOUND', PROFILE_NOT_FOUND);
    }
    if (error instanceof InvoiceNumberConflictError || isUniqueConstraintError(error)) {
      // Allocator bug backstop (sad §7): a unique violation on a system-assigned number still
      // shouldn't happen past the row lock — alert so it's investigated.
      if (wasAllocated) {
        captureMessage('invoice_number_conflict', {
          extra: {
            id,
            senderProfileId: data.senderProfileId,
            invoiceNumber: allocatedNumber,
            wasAllocated,
          },
        });
      }
      return invoiceNumberConflict();
    }
    return failed('Error updating invoice:', error, 'Failed to update invoice.');
  }
}

// Update invoice status (Flow 8, list branch). Touches only status/paidAt: never runs the
// amount, number or legacy checks (AC-17 last sentence). The status/paid-date rule itself lives
// once in applyStatusChange (sad.md §8).
export async function updateInvoiceStatus(
  actor: ActingFreelancer,
  id: string,
  status: string
): Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>> {
  try {
    const parsedStatus = z.nativeEnum(InvoiceStatus, {
      errorMap: () => ({ message: 'Unknown status.' }),
    }).safeParse(status);

    if (!parsedStatus.success) {
      return fail('VALIDATION', 'Unknown status.', {
        fieldErrors: { status: ['Unknown status.'] },
      });
    }

    const { userId } = actor;
    const outcome = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, senderProfile: { userId } },
        select: { status: true, paidAt: true },
      });
      if (!invoice) return null;

      const next = applyStatusChange(invoice, parsedStatus.data);
      const written = await tx.invoice.updateMany({
        where: { id, senderProfile: { userId } },
        data: { status: next.status, paidAt: next.paidAt },
      });
      return written.count === 0 ? null : next;
    });
    if (!outcome) return fail('NOT_FOUND', 'Invoice not found.');

    return ok({
      status: outcome.status,
      paidAt: outcome.paidAt ? outcome.paidAt.toISOString() : null,
    });
  } catch (error) {
    return failed('Error updating invoice status:', error, 'Failed to update invoice status.');
  }
}


// Duplicate an existing invoice (Flow 6, duplicate branch, AC-12). In one transaction: allocate
// from the original's sender-profile sequence (same allocator and format as createInvoice),
// insert the copy with recomputed amounts, status DRAFT, paidAt null.
export async function duplicateInvoice(
  actor: ActingFreelancer,
  id: string
): Promise<ActionResult<{ id: string; invoiceNumber: string }>> {
  try {
    const { userId } = actor;

    const originalInvoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId } },
      include: { items: true },
    });

    if (!originalInvoice) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }

    const senderProfile = await prisma.senderProfile.findFirst({
      where: { id: originalInvoice.senderProfileId, userId },
      select: { id: true },
    });

    if (!senderProfile) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    // F-05/N-07: the source invoice may be a legacy row whose amounts already break the rules
    // (e.g. a negative rate) — check only the amount rules before recomputing, instead of blindly
    // copying a rule-breaking source. Other form rules (names, units, relations) don't concern a
    // copy, and the contract has no VALIDATION for this action: refuse with FAILED and a plain
    // list message the row toast shows as is.
    const parsed = invoiceAmountsSchema.safeParse(transformInvoiceToFormData(originalInvoice));
    if (!parsed.success) {
      const reasons = [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' ');
      return fail('FAILED', `This invoice can't be duplicated. ${reasons}`);
    }
    const validatedData = parsed.data;

    // Stored amounts come only from the shared exact-decimal module (ADR-0006), recomputed from
    // the original's quantity x rate rather than copying its (possibly stale) stored figures.
    const amounts = computeInvoiceAmounts({
      items: validatedData.items.map((item) => ({
        quantity: item.quantity,
        price: item.price,
      })),
      discount: validatedData.discount,
      shipping: validatedData.shipping,
      taxRate: validatedData.taxRate,
    });

    const newInvoice = await prisma.$transaction(async (tx) => {
      const { invoiceNumber, invoiceNumberKey } = await allocateInvoiceNumber(
        tx,
        senderProfile.id,
        userId
      );

      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          invoiceNumberKey,
          senderProfileId: originalInvoice.senderProfileId,
          customerId: originalInvoice.customerId,
          bankAccountId: originalInvoice.bankAccountId,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          paymentTerms: originalInvoice.paymentTerms,
          status: 'DRAFT',
          currency: originalInvoice.currency,
          poNumber: null,
          senderName: originalInvoice.senderName,
          senderLegalName: originalInvoice.senderLegalName,
          senderTaxId: originalInvoice.senderTaxId,
          senderAddress: originalInvoice.senderAddress,
          senderCity: originalInvoice.senderCity,
          senderCountry: originalInvoice.senderCountry,
          senderPostalCode: originalInvoice.senderPostalCode,
          senderPhone: originalInvoice.senderPhone,
          senderEmail: originalInvoice.senderEmail,
          senderWebsite: originalInvoice.senderWebsite,
          senderLogo: originalInvoice.senderLogo,
          customerName: originalInvoice.customerName,
          customerCompanyName: originalInvoice.customerCompanyName,
          customerTaxId: originalInvoice.customerTaxId,
          customerEmail: originalInvoice.customerEmail,
          customerPhone: originalInvoice.customerPhone,
          customerAddress: originalInvoice.customerAddress,
          customerCity: originalInvoice.customerCity,
          customerCountry: originalInvoice.customerCountry,
          customerPostalCode: originalInvoice.customerPostalCode,
          bankName: originalInvoice.bankName,
          bankAccountNumber: originalInvoice.bankAccountNumber,
          bankIban: originalInvoice.bankIban,
          bankSwift: originalInvoice.bankSwift,
          accountName: originalInvoice.accountName,
          subtotal: amounts.subtotal,
          taxRate: originalInvoice.taxRate,
          taxAmount: amounts.taxAmount,
          discount: originalInvoice.discount,
          shipping: originalInvoice.shipping,
          total: amounts.total,
          amountPaid: 0,
          notes: originalInvoice.notes,
          terms: originalInvoice.terms,
          items: {
            create: originalInvoice.items.map((item, index) => ({
              productId: item.productId,
              name: item.name,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              rate: item.rate,
              amount: amounts.items[index].amount,
              currency: item.currency,
            })),
          },
        },
      });

      return created;
    });

    return ok({ id: newInvoice.id, invoiceNumber: newInvoice.invoiceNumber });
  } catch (error) {
    if (error instanceof SenderProfileNotFoundError) {
      return fail('NOT_FOUND', PROFILE_NOT_FOUND);
    }
    if (isUniqueConstraintError(error)) {
      // F-39: contracts/server-actions.md §duplicateInvoice lists only UNAUTHORIZED, NOT_FOUND,
      // FAILED — never CONFLICT, since duplicate has no invoiceNumber field on screen to attach
      // a fieldError to (unlike createInvoice/updateInvoice's manual-number path). A P2002 here
      // can only mean allocateInvoiceNumber's own row lock and key check were bypassed — an
      // allocator bug, so it gets the same backstop alert those two raise.
      captureMessage('invoice_number_conflict', { extra: { id } });
      return fail('FAILED', 'Failed to duplicate invoice.');
    }
    return failed('Error duplicating invoice:', error, 'Failed to duplicate invoice.');
  }
}

export async function deleteInvoice(actor: ActingFreelancer, id: string): Promise<ActionResult> {
  try {
    const { userId } = actor;
    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId } },
      select: { status: true },
    });
    if (!invoice) return fail('NOT_FOUND', 'Invoice not found.');
    if (invoice.status !== 'DRAFT') {
      return fail('CONFLICT', 'Only draft invoices can be deleted. Consider cancelling instead.');
    }

    const deleted = await prisma.invoice.deleteMany({
      where: { id, status: 'DRAFT', senderProfile: { userId } },
    });
    if (deleted.count === 0) return fail('NOT_FOUND', 'Invoice not found.');
    return ok();
  } catch (error) {
    return failed('Error deleting invoice:', error, 'Failed to delete invoice.');
  }
}
