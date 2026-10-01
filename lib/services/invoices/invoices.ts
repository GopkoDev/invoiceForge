import 'server-only';
import { z } from 'zod';
import { InvoiceStatus, type Prisma } from '@prisma/client';
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
  listQuerySchema,
  paginate,
  type Page,
} from '@/lib/services/_shared/list-query';
import { localDayRange } from '@/lib/services/_shared/time-zone';
import {
  buildBankAccountSnapshot,
  buildCustomerSnapshot,
  buildSenderSnapshot,
  computeInvoiceLegacyInfo,
  serializeDecimal,
  serializeInvoice,
  verifyInvoiceRelations,
  verifyItemProductsOwnership,
} from '@/lib/actions/invoice-actions/helpers';
import { invoiceListSelect } from '@/lib/actions/invoice-actions/select-queries';
import { captureMessage } from '@sentry/nextjs';
import { invoiceFormSchema, type InvoiceFormValues } from '@/lib/validations/invoice';
import { applyStatusChange } from '@/lib/helpers/invoice-status';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';
import {
  allocateInvoiceNumber,
  isInvoiceKeyTaken,
  lockSenderProfileRow,
  normalizeInvoiceNumber,
  peekNextInvoiceNumber as peekNextNumber,
} from '@/lib/actions/invoice-actions/numbering';

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

    const invoiceNumber = await peekNextNumber(senderProfileId);
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
      .string({ message: 'Unknown status.' })
      .refine((value) => value === 'all' || value in InvoiceStatus, 'Unknown status.')
      .transform((value) => value as InvoiceStatus | 'all')
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
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { senderName: { contains: search, mode: 'insensitive' } },
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
        orderBy: { name: 'asc' },
      }),
      prisma.senderProfile.findMany({
        where: { userId: actor.userId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
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
  invoiceNumber: string,
  excludeInvoiceId?: string
): Promise<{ invoiceNumber: string; invoiceNumberKey: string; wasAllocated: boolean }> {
  if (invoiceNumber === '') {
    const allocated = await allocateInvoiceNumber(tx, senderProfileId);
    return { ...allocated, wasAllocated: true };
  }

  // F-10: take the same row lock the allocator does, so a manual save and a concurrent
  // allocation for the same profile always serialize instead of racing — otherwise both can pass
  // this check before either commits, and the loser surfaces as a raw P2002 (wrongly alerting the
  // allocator-bug backstop below when the loser happened to be system-assigned).
  await lockSenderProfileRow(tx, senderProfileId);

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

