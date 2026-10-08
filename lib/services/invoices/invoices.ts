import 'server-only';
import { z } from 'zod';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionFailure, type ActionResult } from '@/types/result';
import type {
  InvoiceFilterOptions,
  InvoiceIssuedDetails,
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
import { addDaysToDay, dayToUtcDate, utcDateToDay, utcDayRange } from '@/lib/helpers/calendar-day';
import {
  transformInvoiceToFormData,
  buildBankAccountSnapshot,
  buildCustomerSnapshot,
  buildSenderSnapshot,
  computeInvoiceLegacyInfo,
  serializeDecimal,
  serializeInvoice,
  INVOICE_ITEM_ORDER,
  checkDraftRules,
} from '@/lib/services/invoices/helpers';
import { issuedDetailsOf } from '@/lib/services/invoices/editor-data';
import { invoiceListSelect } from '@/lib/services/invoices/select-queries';
import { captureMessage, startSpan } from '@sentry/nextjs';
import {
  invoiceAmountsSchema,
  invoiceShapeSchema,
  invoiceUpdateFormSchema,
  checkDueDate,
  type FieldErrors,
  type InvoiceFormInput,
} from '@/lib/validations/invoice';
import {
  isDerivedOverdue,
  statusFilterWhere,
  statusToStoreOnSave,
  todayIn,
  withDerivedStatus,
} from '@/lib/services/_shared/overdue';
import {
  STATUS_MESSAGES,
  decideCreateStatus,
  decideDelete,
  decideStatusChange,
} from '@/lib/helpers/invoice-status';
import { ISSUED_INVOICE_LOCKED_MESSAGE, compareLockedFields } from '@/lib/helpers/invoice-locked-fields';
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
        items: { orderBy: INVOICE_ITEM_ORDER },
        senderProfile: true,
        customer: true,
        bankAccount: true,
      },
    });
    if (!invoice) return fail('NOT_FOUND', 'Invoice not found.');

    const serialized = serializeInvoice(withDerivedStatus(invoice, todayIn(actor.timeZone)));
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

    // invoice-integrity T07: the hint has no issue date yet, so its year is today's calendar day in
    // the Freelancer time zone; the number assigned on save may carry another year (AC-21).
    const invoiceNumber = await peekNextNumber(
      senderProfileId,
      actor.userId,
      dayToUtcDate(todayIn(actor.timeZone))
    );
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
    const today = todayIn(actor.timeZone);

    // The tab wins over the status filter, which applies on the all tab only (as the page does).
    if (tab === 'drafts') where.status = 'DRAFT';
    else if (tab === 'final') where.status = { not: 'DRAFT' };
    else if (status !== 'all') where.AND = [statusFilterWhere(status, today)];

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
      // The issue date is a stored calendar day (T25): the range is compared by day, in no zone.
      const [gte, lt] = utcDayRange(dateFrom, dateTo);
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
        ...withDerivedStatus(inv, today),
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
  /** The stored status; the editor shows the overdue badge from `derivedOverdue` instead (AC-24). */
  status: InvoiceStatus;
  derivedOverdue: boolean;
  paidAt: string | null;
  /** The stored issue/due instants after the save (ISO). The editor takes them as the dates it now holds,
   * so a second save compares against what is stored, not the pre-save snapshot (T44 review, I-01). */
  issueDate: string;
  dueDate: string;
  /** Invoice.version after the write (ADR-0004): the editor's next loadedVersion. */
  version: number;
  /** The issued details the row holds after the write (T22): set whenever the row is not a draft, so the
   * editor shows what the server froze; null for a draft. */
  issuedDetails: InvoiceIssuedDetails | null;
};

const FIX_FIELDS_MESSAGE = 'Please fix the highlighted fields.';

function hasFieldErrors(fieldErrors: FieldErrors): boolean {
  return Object.keys(fieldErrors).length > 0;
}

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
  excludeInvoiceId: string | undefined,
  issueDate: Date
): Promise<{ invoiceNumber: string; invoiceNumberKey: string; wasAllocated: boolean }> {
  if (invoiceNumber === '') {
    const allocated = await allocateInvoiceNumber(tx, senderProfileId, userId, issueDate);
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


const CURRENCY_FIELD = /^(bankAccountId|items\.\d+\.productId)$/;
const BOUNDS_FIELD = /^(taxRate|discount|shipping|items\.\d+\.(quantity|price|total))$/;

/**
 * The outcome recorded on a save / status-change span (review S2, sad §7 Monitoring, §8): `ok`,
 * `failed`, or `refused:<kind>`. Kinds only — never a message, a field value or an amount.
 */
function outcomeOf(result: ActionResult<unknown>): string {
  if (result.success) return 'ok';
  if (result.code === 'FAILED') return 'failed';
  switch (result.details?.kind) {
    case 'STATUS_NOT_ALLOWED':
      return 'refused:lifecycle';
    case 'ISSUED_INVOICE_LOCKED':
      return 'refused:locked-field';
    case 'CHANGED_ELSEWHERE':
      return 'refused:changed-elsewhere';
    case 'TOTALS_CHANGED':
      return 'refused:totals-changed';
  }
  const fields = Object.keys(result.fieldErrors ?? {});
  if (fields.some((field) => CURRENCY_FIELD.test(field))) return 'refused:currency';
  if (fields.some((field) => BOUNDS_FIELD.test(field))) return 'refused:bounds';
  return `refused:${result.code.toLowerCase().replace('_', '-')}`;
}

/** Runs a save or status change in its span and records the outcome of whatever it returns. */
function inOutcomeSpan<T>(
  options: { name: string; attributes?: Record<string, string> },
  run: () => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  return startSpan({ ...options, op: 'function' }, async (span) => {
    const result = await run();
    // Optional: older test doubles of startSpan call the callback without a span.
    span?.setAttribute('outcome', outcomeOf(result));
    return result;
  });
}

export async function createInvoice(actor: ActingFreelancer, data: InvoiceFormInput) {
  return inOutcomeSpan({ name: 'invoices.save', attributes: { operation: 'create' } }, () =>
    createInvoiceUnspanned(actor, data)
  );
}

async function createInvoiceUnspanned(
  actor: ActingFreelancer,
  data: InvoiceFormInput
): Promise<ActionResult<SavedInvoice>> {
  // Set inside the transaction when the number was system-assigned, so the P2002 backstop below
  // knows whether to alert Sentry (checklist: only for system-assigned numbers).
  let wasAllocated = false;
  let allocatedNumber = '';

  try {
    const { userId } = actor;
    // invoice-integrity T07 — contracts/server-actions.md §createInvoice, first failure wins:
    // shape → status (AC-04b) → ownership (NOT_FOUND) → every draft rule together → number.
    const parsed = invoiceShapeSchema.safeParse(data);
    if (!parsed.success) {
      return zodValidationFailure(parsed.error);
    }
    const validatedData = parsed.data;

    const createStatus = decideCreateStatus(validatedData.status);
    if (createStatus.kind === 'refused') {
      return fail('VALIDATION', createStatus.message, {
        fieldErrors: { status: [createStatus.message] },
        details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'DRAFT', suggestion: null },
      });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      // T26 (review F7, ADR-0005): the sender-profile lock first, so an account's currency can't
      // change between the draft rules and the insert; the rules then run on the locked state.
      await lockSenderProfileRow(tx, validatedData.senderProfileId, userId);
      const checked = await checkDraftRules(userId, validatedData, tx);
      if (!checked.success) throw new InvoiceRefusal(checked);
      if (hasFieldErrors(checked.data.fieldErrors)) {
        throw new InvoiceRefusal(fail('VALIDATION', FIX_FIELDS_MESSAGE, { fieldErrors: checked.data.fieldErrors }));
      }
      const { senderProfile, customer, bankAccount } = checked.data;

      const resolved = await resolveManualOrAllocatedNumber(
        tx,
        senderProfile.id,
        userId,
        validatedData.invoiceNumber,
        undefined,
        validatedData.issueDate
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
          status: 'DRAFT',
          paidAt: null,
          version: 0,
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
      derivedOverdue: isDerivedOverdue(invoice, todayIn(actor.timeZone)),
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      version: invoice.version,
      issuedDetails: invoice.status === InvoiceStatus.DRAFT ? null : issuedDetailsOf(invoice),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    if (error instanceof InvoiceRefusal) return error.result;
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
    return failed('Error creating invoice:', error, 'Failed to create invoice.', 'invoices.create');
  }
}

const LEGACY_SHARED_NUMBER_MESSAGE =
  'This invoice number is also used by another invoice. Change it to a free one to save.';

/** Thrown inside updateInvoice's transaction for AC-17's shared-number case (step 4): the
 * invoice's own key is NULL or shared, and the submitted number is unchanged. */
class InvoiceLegacySharedNumberError extends Error {}
class InvoiceVanishedError extends Error {}

/** A refusal decided inside a save transaction: rolls the transaction back, then returned as is. */
class InvoiceRefusal extends Error {
  constructor(public readonly result: ActionFailure) {
    super(result.code);
  }
}

/**
 * Locks the invoice row of this owner (`FOR UPDATE OF i`, the owner in the lock's own WHERE) and
 * reads it with its lines under the lock. Another Freelancer's invoice locks nothing and is treated
 * exactly like a missing one (InvoiceVanishedError → NOT_FOUND, AC-23).
 */
async function lockInvoiceRow(tx: Prisma.TransactionClient, id: string, userId: string) {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT i.id FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp.id = i."senderProfileId"
    WHERE i.id = ${id} AND sp."userId" = ${userId} FOR UPDATE OF i`;
  if (!locked) throw new InvoiceVanishedError();
  const invoice = await tx.invoice.findFirst({
    where: { id, senderProfile: { userId } },
    include: { items: { orderBy: INVOICE_ITEM_ORDER } },
  });
  if (!invoice) throw new InvoiceVanishedError();
  return invoice;
}

const CHANGED_ELSEWHERE_MESSAGE =
  'This invoice was changed elsewhere after you opened it. Reload it to see the latest version.';

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

// Update an existing invoice (flows 1, 2 and 4). The checks run in the order fixed by
// contracts/server-actions.md §updateInvoice (invoice-integrity): shape -> on the locked row
// NOT_FOUND -> CHANGED_ELSEWHERE -> cancelled -> the lifecycle -> issued: locked fields and the due
// date / draft: every draft rule, then the move/manual number rules (AC-11), the legacy
// shared-number check and totals confirmation (AC-17).
/**
 * T40 (r2 H-01): an unedited date keeps its stored value. A legacy instant (not a UTC midnight) whose
 * UTC day equals the submitted day is what the editor showed untouched, so rewriting it to a midnight
 * would lock in a wrong day before the zone is known (lazy normalisation skips midnights).
 * `read` is the instant the editor loaded (`loadedIssueDate`/`loadedDueDate`, else the row as read
 * before the transaction); `current` is the row's value under the lock, which a zone write may have
 * normalised since, so an unedited date keeps `current`, never the stale `read`. A client-supplied
 * `read` can at most make the save keep `current`; it never writes a new value.
 */
function keepUnchangedLegacyDay(read: Date, submitted: Date, current: Date): Date {
  const isMidnight = read.getTime() % 86_400_000 === 0;
  if (!isMidnight && utcDateToDay(read) === utcDateToDay(submitted)) return current;
  return submitted;
}

/**
 * updateInvoice's input. `loadedVersion` is required at runtime (the shape parse refuses a missing
 * one, AC-10); the type keeps it optional because the editor builds create and update payloads with
 * one function, and a new invoice has no version yet.
 */
export type UpdateInvoiceInput = InvoiceFormInput & { loadedVersion?: number };

/** Several rules can fail on one key (a huge discount breaks its bound and the cap): keep every message. */
function mergeFieldErrors(...sets: FieldErrors[]): FieldErrors {
  const merged: FieldErrors = {};
  for (const set of sets) {
    for (const [key, messages] of Object.entries(set)) {
      merged[key] = [...new Set([...(merged[key] ?? []), ...messages])];
    }
  }
  return merged;
}

/** The per-field amount bounds (types excluded) of a draft's amounts, as field errors. */
function amountBoundErrors(values: unknown): FieldErrors {
  const shape = invoiceAmountsSchema.safeParse(values);
  return shape.success ? {} : zodValidationFailure(shape.error).fieldErrors ?? {};
}

export async function updateInvoice(actor: ActingFreelancer, id: string, data: UpdateInvoiceInput) {
  return inOutcomeSpan({ name: 'invoices.save', attributes: { operation: 'update' } }, () =>
    updateInvoiceUnspanned(actor, id, data)
  );
}

async function updateInvoiceUnspanned(
  actor: ActingFreelancer,
  id: string,
  data: UpdateInvoiceInput
): Promise<ActionResult<SavedInvoice>> {
  // Set inside the transaction when the number was system-assigned, so the P2002 backstop below
  // knows whether to alert Sentry (checklist: only for system-assigned numbers).
  let wasAllocated = false;
  let allocatedNumber = '';

  try {
    const { userId } = actor;
    // invoice-integrity T08 (contracts/server-actions.md §updateInvoice): the shape only before the
    // transaction; every rule runs on the locked row, in contract order, first failure wins.
    const parsed = invoiceUpdateFormSchema.safeParse(data);
    if (!parsed.success) {
      return zodValidationFailure(parsed.error);
    }
    const validatedData = parsed.data;

    const invoice = await prisma.$transaction(async (tx) => {
      // Step 2: lock the row of this owner, then read it (and its lines) under the lock.
      const existingInvoice = await lockInvoiceRow(tx, id, userId);

      // Step 3 (AC-10, ADR-0004): an outdated view is refused before any other rule.
      if (validatedData.loadedVersion !== existingInvoice.version) {
        throw new InvoiceRefusal(
          fail('CONFLICT', CHANGED_ELSEWHERE_MESSAGE, {
            details: { kind: 'CHANGED_ELSEWHERE', currentVersion: existingInvoice.version },
          })
        );
      }

      // Step 4 (AC-06): a cancelled invoice is final.
      if (existingInvoice.status === 'CANCELLED') {
        throw new InvoiceRefusal(
          fail('VALIDATION', STATUS_MESSAGES.cancelled, {
            details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'CANCELLED', suggestion: 'DUPLICATE' },
          })
        );
      }

      // Step 5 (ADR-0002): a status change goes through the lifecycle. The overdue status of a
      // derived-overdue invoice is never stored (AC-24), so echoing it is the same status.
      const today = todayIn(actor.timeZone);
      const decision = decideStatusChange(
        existingInvoice,
        statusToStoreOnSave(existingInvoice, validatedData.status, today),
        { now: new Date(), today }
      );
      if (decision.kind === 'refused') {
        throw new InvoiceRefusal(
          fail('VALIDATION', decision.message, {
            fieldErrors: { status: [decision.message] },
            details: {
              kind: 'STATUS_NOT_ALLOWED',
              currentStatus: existingInvoice.status,
              suggestion: decision.suggestion,
            },
          })
        );
      }
      const { status, paidAt } =
        decision.kind === 'change'
          ? decision
          : { status: existingInvoice.status, paidAt: existingInvoice.paidAt };

      // Step 6 (ADR-0003, AC-08, AC-09, AC-14): an issued invoice changes only its four editable
      // fields; the issued details, number, relations, amounts and lines stay as they are.
      if (existingInvoice.status !== 'DRAFT') {
        // An unedited legacy issue date is unchanged (T40/T44): compare the date the save would keep.
        const issueDate = keepUnchangedLegacyDay(
          validatedData.loadedIssueDate ? new Date(validatedData.loadedIssueDate) : existingInvoice.issueDate,
          validatedData.issueDate,
          existingInvoice.issueDate
        );
        const lockedChanges = compareLockedFields(existingInvoice, { ...validatedData, issueDate });
        if (Object.keys(lockedChanges).length > 0) {
          throw new InvoiceRefusal(
            fail('VALIDATION', ISSUED_INVOICE_LOCKED_MESSAGE, {
              fieldErrors: lockedChanges,
              details: { kind: 'ISSUED_INVOICE_LOCKED' },
            })
          );
        }
        const dueDate = keepUnchangedLegacyDay(
          validatedData.loadedDueDate ? new Date(validatedData.loadedDueDate) : existingInvoice.dueDate,
          validatedData.dueDate,
          existingInvoice.dueDate
        );
        if (utcDateToDay(dueDate) !== utcDateToDay(existingInvoice.dueDate)) {
          const dueDateErrors = checkDueDate(existingInvoice.issueDate, dueDate);
          if (hasFieldErrors(dueDateErrors)) {
            throw new InvoiceRefusal(fail('VALIDATION', FIX_FIELDS_MESSAGE, { fieldErrors: dueDateErrors }));
          }
        }
        return tx.invoice.update({
          where: { id, senderProfile: { userId } },
          data: {
            dueDate,
            notes: validatedData.notes,
            paymentTerms: validatedData.paymentTerms,
            poNumber: validatedData.poNumber,
            status,
            paidAt,
            version: { increment: 1 },
          },
        });
      }

      // Step 7 (T09, flow 4): a draft, including one being issued from the editor. Every draft rule
      // on the locked row, all failures together: ownership (NOT_FOUND), currencies, amount bounds,
      // discount cap, due date. The issued details are then refreshed from the current records,
      // which is what freezes when the draft is issued (AC-02).
      // T26 (review F7): the target profile's lock comes before the rules on every branch, the
      // unchanged-number one included (order: invoice row, profile, products).
      await lockSenderProfileRow(tx, validatedData.senderProfileId, userId);
      const draftRules = await checkDraftRules(userId, validatedData, tx);
      if (!draftRules.success) throw new InvoiceRefusal(draftRules);
      // The per-field amount bounds belong to the draft branch (T23, AC-14): the update parse is the
      // shape only, so an issued invoice's locked amounts are never judged.
      const fieldErrors = mergeFieldErrors(amountBoundErrors(validatedData), draftRules.data.fieldErrors);
      if (hasFieldErrors(fieldErrors)) {
        throw new InvoiceRefusal(fail('VALIDATION', FIX_FIELDS_MESSAGE, { fieldErrors }));
      }

      const { senderProfile, customer, bankAccount } = draftRules.data;
      const moved = validatedData.senderProfileId !== existingInvoice.senderProfileId;

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
          existingInvoice.id,
          validatedData.issueDate
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
          // The read instant: the editor's loaded one, else the locked row's; the row's value under
          // the lock is what an unedited date keeps (T40, I-01).
          issueDate: keepUnchangedLegacyDay(
            validatedData.loadedIssueDate
              ? new Date(validatedData.loadedIssueDate)
              : existingInvoice.issueDate,
            validatedData.issueDate,
            existingInvoice.issueDate
          ),
          dueDate: keepUnchangedLegacyDay(
            validatedData.loadedDueDate
              ? new Date(validatedData.loadedDueDate)
              : existingInvoice.dueDate,
            validatedData.dueDate,
            existingInvoice.dueDate
          ),
          paymentTerms: validatedData.paymentTerms,
          status,
          paidAt,
          version: { increment: 1 },
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
      derivedOverdue: isDerivedOverdue(invoice, todayIn(actor.timeZone)),
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      version: invoice.version,
      issuedDetails: invoice.status === InvoiceStatus.DRAFT ? null : issuedDetailsOf(invoice),
    });
  } catch (error) {
    if (error instanceof InvoiceRefusal) {
      return error.result;
    }
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
    if (isRecordNotFoundError(error) || error instanceof InvoiceVanishedError) {
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
    return failed('Error updating invoice:', error, 'Failed to update invoice.', 'invoices.update');
  }
}

// Update invoice status (the list, flow 5). Touches only status/paidAt/version: never runs the
// number or legacy-total checks (AC-17 last sentence). The lifecycle and the paid-date rule live
// once in decideStatusChange (ADR-0002).
export async function updateInvoiceStatus(actor: ActingFreelancer, id: string, status: string) {
  return inOutcomeSpan({ name: 'invoices.status-change' }, () =>
    updateInvoiceStatusUnspanned(actor, id, status)
  );
}

async function updateInvoiceStatusUnspanned(
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

    // invoice-integrity T10 (flow 5, ADR-0002): no version check; one transaction on the locked
    // row, decided against its current status. Issued details are never written here.
    const { userId } = actor;
    const outcome = await prisma.$transaction(async (tx) => {
      const invoice = await lockInvoiceRow(tx, id, userId);
      const today = todayIn(actor.timeZone);
      // The overdue status of a derived-overdue invoice is never stored (mcp-server ADR-0005):
      // asking for it is asking for the status it already has.
      const target = statusToStoreOnSave(invoice, parsedStatus.data, today);
      const decision = decideStatusChange(invoice, target, { now: new Date(), today });
      if (decision.kind === 'unchanged') {
        return { status: invoice.status, paidAt: invoice.paidAt };
      }
      if (decision.kind === 'refused') {
        throw new InvoiceRefusal(
          fail('VALIDATION', decision.message, {
            details: {
              kind: 'STATUS_NOT_ALLOWED',
              currentStatus: invoice.status,
              suggestion: decision.suggestion,
            },
          })
        );
      }

      // Issuing from the list runs every draft rule over the stored draft (AC-14, AC-25).
      if (invoice.status === 'DRAFT') {
        const form = transformInvoiceToFormData(invoice);
        const draftRules = await checkDraftRules(userId, form, tx);
        if (!draftRules.success) throw new InvoiceRefusal(draftRules);
        // Same bounds as the editor's Save and issue (T23, AC-14, AC-25).
        const fieldErrors = mergeFieldErrors(amountBoundErrors(form), draftRules.data.fieldErrors);
        if (hasFieldErrors(fieldErrors)) {
          const reasons = [...new Set(Object.values(fieldErrors).flat())].join(' ');
          throw new InvoiceRefusal(fail('VALIDATION', reasons, { fieldErrors }));
        }
      }

      return tx.invoice.update({
        where: { id, senderProfile: { userId } },
        data: { status: decision.status, paidAt: decision.paidAt, version: { increment: 1 } },
        select: { status: true, paidAt: true },
      });
    });

    return ok({
      status: outcome.status,
      paidAt: outcome.paidAt ? outcome.paidAt.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof InvoiceRefusal) return error.result;
    if (error instanceof InvoiceVanishedError) return fail('NOT_FOUND', 'Invoice not found.');
    return failed('Error updating invoice status:', error, 'Failed to update invoice status.', 'invoices.status-change');
  }
}


// Duplicate an existing invoice (Flow 6, duplicate branch, AC-12). In one transaction: allocate
// from the original's sender-profile sequence (same allocator and format as createInvoice),
// insert the copy with recomputed amounts, status DRAFT, paidAt null.
export async function duplicateInvoice(actor: ActingFreelancer, id: string) {
  return inOutcomeSpan({ name: 'invoices.save', attributes: { operation: 'duplicate' } }, () =>
    duplicateInvoiceUnspanned(actor, id)
  );
}

async function duplicateInvoiceUnspanned(
  actor: ActingFreelancer,
  id: string
): Promise<ActionResult<{ id: string; invoiceNumber: string }>> {
  try {
    const { userId } = actor;
    const today = todayIn(actor.timeZone);

    const originalInvoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId } },
      include: { items: { orderBy: INVOICE_ITEM_ORDER } },
    });

    if (!originalInvoice) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }

    // invoice-integrity T07 (contracts/server-actions.md §duplicateInvoice): a source in any status,
    // CANCELLED included, becomes a new draft that goes through the create rules. The source may be
    // a legacy row that breaks them (a negative rate, a currency that no longer matches): the amount
    // shape (F-05/N-07) and every draft rule are checked, and a failure is VALIDATION with the
    // reasons as a plain list — user input, never FAILED, never reported to Sentry.
    const form = transformInvoiceToFormData(originalInvoice);
    const issueDate = dayToUtcDate(today);
    const dueDate = dayToUtcDate(addDaysToDay(today, 30));

    const shapeErrors = amountBoundErrors(form);

    // Stored amounts come only from the shared exact-decimal module (ADR-0006), recomputed from
    // the original's quantity x rate rather than copying its (possibly stale) stored figures.
    const amounts = computeInvoiceAmounts({
      items: form.items.map((item) => ({ quantity: item.quantity, price: item.price })),
      discount: form.discount,
      shipping: form.shipping,
      taxRate: form.taxRate,
    });

    const newInvoice = await prisma.$transaction(async (tx) => {
      // T26 (review F7, ADR-0005): the sender-profile lock first, then the draft rules on the
      // locked state, so a currency change can't commit between the check and the insert.
      await lockSenderProfileRow(tx, originalInvoice.senderProfileId, userId);
      const checked = await checkDraftRules(
        userId,
        {
          senderProfileId: originalInvoice.senderProfileId,
          customerId: originalInvoice.customerId,
          bankAccountId: originalInvoice.bankAccountId,
          currency: originalInvoice.currency,
          items: form.items,
          taxRate: form.taxRate,
          discount: form.discount,
          shipping: form.shipping,
          issueDate,
          dueDate,
        },
        tx
      );
      if (!checked.success) throw new InvoiceRefusal(checked);
      const fieldErrors = mergeFieldErrors(shapeErrors, checked.data.fieldErrors);
      if (hasFieldErrors(fieldErrors)) {
        const reasons = [...new Set(Object.values(fieldErrors).flat())].join(' ');
        throw new InvoiceRefusal(
          fail('VALIDATION', `This invoice can't be duplicated. ${reasons}`, { fieldErrors })
        );
      }
      const { senderProfile, customer, bankAccount } = checked.data;

      const { invoiceNumber, invoiceNumberKey } = await allocateInvoiceNumber(
        tx,
        senderProfile.id,
        userId,
        issueDate
      );

      return tx.invoice.create({
        data: {
          invoiceNumber,
          invoiceNumberKey,
          senderProfileId: originalInvoice.senderProfileId,
          customerId: originalInvoice.customerId,
          bankAccountId: originalInvoice.bankAccountId,
          // Calendar days (T25): today in the owner's zone and 30 days after it, each at T00:00:00Z.
          issueDate,
          dueDate,
          paymentTerms: originalInvoice.paymentTerms,
          status: 'DRAFT',
          paidAt: null,
          version: 0,
          currency: originalInvoice.currency,
          poNumber: null,
          // A duplicate is a new draft: its issued details are the current records' (ADR-0001).
          ...buildSenderSnapshot(senderProfile),
          ...buildCustomerSnapshot(customer),
          ...buildBankAccountSnapshot(bankAccount),
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
    });

    return ok({ id: newInvoice.id, invoiceNumber: newInvoice.invoiceNumber });
  } catch (error) {
    if (error instanceof InvoiceRefusal) return error.result;
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
    return failed('Error duplicating invoice:', error, 'Failed to duplicate invoice.', 'invoices.duplicate');
  }
}

export async function deleteInvoice(actor: ActingFreelancer, id: string): Promise<ActionResult> {
  try {
    // invoice-integrity T10 (flow 6, AC-06): only a draft is deleted, decided on the locked row.
    const { userId } = actor;
    await prisma.$transaction(async (tx) => {
      const invoice = await lockInvoiceRow(tx, id, userId);
      const decision = decideDelete(invoice.status);
      if (decision.kind === 'refused') {
        throw new InvoiceRefusal(
          fail('VALIDATION', decision.message, {
            details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: invoice.status, suggestion: null },
          })
        );
      }
      await tx.invoice.deleteMany({ where: { id, status: 'DRAFT', senderProfile: { userId } } });
    });
    return ok();
  } catch (error) {
    if (error instanceof InvoiceRefusal) return error.result;
    if (error instanceof InvoiceVanishedError) return fail('NOT_FOUND', 'Invoice not found.');
    return failed('Error deleting invoice:', error, 'Failed to delete invoice.');
  }
}
