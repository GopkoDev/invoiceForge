'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  invoiceFormSchema,
  invoiceAmountsSchema,
  InvoiceFormValues,
} from '@/lib/validations/invoice';
import { revalidatePath } from 'next/cache';
import { captureMessage } from '@sentry/nextjs';
import { protectedRoutes } from '@/config/routes.config';
import { ActionResult, ok, fail } from '@/types/actions';
import { z } from 'zod';
import {
  zodValidationFailure,
  isUniqueConstraintError,
  failed,
} from '@/lib/actions/action-result-helpers';
import {
  InvoiceEditorData,
  InvoiceSenderProfile,
  InvoiceBankAccount,
  InvoiceCustomer,
  InvoiceProduct,
  InvoiceCustomPrice,
  SerializedInvoice,
  InvoiceListItem,
  PaginatedInvoiceList,
} from '@/types/invoice/types';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { applyStatusChange } from '@/lib/helpers/invoice-status';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';
import { getRequestTimeZone, localDayRange } from '@/lib/helpers/time-zone';
import { InvoiceListParams } from '@/lib/validations/search-params';
import {
  allocateInvoiceNumber,
  isInvoiceKeyTaken,
  lockSenderProfileRow,
  normalizeInvoiceNumber,
  peekNextInvoiceNumber,
} from './numbering';

import {
  senderProfileSelect,
  bankAccountSelect,
  customerSelect,
  productSelect,
  customPriceSelect,
  invoiceListSelect,
} from './select-queries';

import {
  serializeInvoice,
  serializeDecimal,
  buildSenderSnapshot,
  buildCustomerSnapshot,
  buildBankAccountSnapshot,
  computeInvoiceLegacyInfo,
  transformInvoiceToFormData,
  verifyInvoiceRelations,
  verifyItemProductsOwnership,
} from './helpers';

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
class InvoiceNumberConflictError extends Error {}

function invoiceNumberConflict(): ActionResult<never> {
  return fail('CONFLICT', INVOICE_NUMBER_CONFLICT_MESSAGE, {
    fieldErrors: { invoiceNumber: [INVOICE_NUMBER_CONFLICT_MESSAGE] },
  });
}

// The manual-number rules shared by createInvoice and updateInvoice (contracts/server-actions.md
// §createInvoice number table, §updateInvoice step 2/3, verbatim): empty allocates under the row
// lock (AC-06, AC-07, AC-09); typed keeps it if free, else rolls the transaction back (AC-08, AC-10).
async function resolveManualOrAllocatedNumber(
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

// Returns the next proposed invoice number as a hint only (AC-06): never the number actually
// saved — that only ever comes from allocateInvoiceNumber inside the save transaction.
export async function generateInvoiceNumber(
  senderProfileId: string
): Promise<ActionResult<string>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: authResult.data.userId },
      select: { id: true },
    });

    if (!profile) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    const invoiceNumber = await peekNextInvoiceNumber(senderProfileId);
    if (invoiceNumber === null) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    return ok(invoiceNumber);
  } catch (error) {
    return failed('Error generating invoice number:', error, 'Failed to generate invoice number.');
  }
}

// Get all data needed for invoice editor
export async function getInvoiceEditorData(
  invoiceId?: string
): Promise<ActionResult<InvoiceEditorData>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const [senderProfiles, customers, products, customPrices, existingInvoice] =
      await Promise.all([
        prisma.senderProfile.findMany({
          where: { userId },
          select: {
            ...senderProfileSelect,
            bankAccounts: { select: bankAccountSelect },
          },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        }),
        prisma.customer.findMany({
          where: { userId },
          select: customerSelect,
          orderBy: { name: 'asc' },
        }),
        prisma.product.findMany({
          where: { userId, isActive: true },
          select: productSelect,
          orderBy: { name: 'asc' },
        }),
        prisma.customPrice.findMany({
          where: { product: { userId } },
          select: customPriceSelect,
        }),
        invoiceId
          ? prisma.invoice.findFirst({
              where: { id: invoiceId, senderProfile: { userId } },
              include: { items: true },
            })
          : null,
      ]);

    // Extract bank accounts from sender profiles
    const bankAccounts: InvoiceBankAccount[] = senderProfiles.flatMap(
      (p) => p.bankAccounts
    );

    // Transform products and custom prices (need to serialize Decimal)
    const transformedProducts: InvoiceProduct[] = products.map((p) => ({
      ...p,
      price: serializeDecimal(p.price),
    }));

    const transformedCustomPrices: InvoiceCustomPrice[] = customPrices.map(
      (cp) => ({
        ...cp,
        price: serializeDecimal(cp.price),
      })
    );

    // Remove bankAccounts from sender profiles for the response
    const transformedProfiles: InvoiceSenderProfile[] = senderProfiles.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ bankAccounts: _bankAccounts, ...profile }) => profile
    );

    // AC-17's legacy flags, computed once here off the invoice as stored (contracts/server-actions.md
    // §getInvoiceEditorData / getInvoice, verbatim).
    const legacy = existingInvoice
      ? await computeInvoiceLegacyInfo(prisma, existingInvoice)
      : null;

    return ok({
      senderProfiles: transformedProfiles,
      bankAccounts,
      customers: customers as InvoiceCustomer[],
      products: transformedProducts,
      customPrices: transformedCustomPrices,
      initialData: existingInvoice
        ? transformInvoiceToFormData(existingInvoice)
        : undefined,
      invoiceId,
      legacy,
    });
  } catch (error) {
    return failed('Error fetching invoice editor data:', error, 'Failed to fetch invoice editor data.');
  }
}

// Create a new invoice (Flow 2). The number, amounts and paid date are decided server-side, in
// one transaction (contracts/server-actions.md §createInvoice, verbatim; sad.md §8 rows Invoice
// numbering / Money / Authorization).
export async function createInvoice(
  data: InvoiceFormValues
): Promise<ActionResult<SavedInvoice>> {
  // Set inside the transaction when the number was system-assigned, so the P2002 backstop below
  // knows whether to alert Sentry (checklist: only for system-assigned numbers).
  let wasAllocated = false;
  let allocatedNumber = '';

  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
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

    revalidatePath(protectedRoutes.invoices);
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

// Update an existing invoice (Flows 2, 6 move, 7 legacy, 8 status from the editor). The checks
// run in the order fixed by contracts/server-actions.md §updateInvoice, verbatim: UNAUTHORIZED ->
// VALIDATION (schema) -> NOT_FOUND (invoice, or new relations not owned) -> the move/manual number
// rules (AC-11) -> the legacy shared-number check (AC-17) -> the legacy totals confirmation
// (AC-17) -> applyStatusChange (AC-18, AC-19), all inside one transaction.
export async function updateInvoice(
  id: string,
  data: InvoiceFormValues
): Promise<ActionResult<SavedInvoice>> {
  // Set inside the transaction when the number was system-assigned, so the P2002 backstop below
  // knows whether to alert Sentry (checklist: only for system-assigned numbers).
  let wasAllocated = false;
  let allocatedNumber = '';

  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
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
      // unmoved, unchanged number instead runs the legacy shared-number check (F-09: a NULL key
      // is checked by its own invoiceNumber's normalized key, never blanket-treated as shared),
      // and only when it's free does it keep the number and (for a legacy row) get its key
      // written; a changed, non-empty number falls through to the same manual rules (AC-08,
      // AC-10). A's counter is never touched either way.
      const numberUnchanged =
        !moved &&
        validatedData.invoiceNumber !== '' &&
        normalizeInvoiceNumber(validatedData.invoiceNumber) ===
          normalizeInvoiceNumber(existingInvoice.invoiceNumber);

      let resolvedNumber: { invoiceNumber: string; invoiceNumberKey: string; wasAllocated: boolean };
      if (numberUnchanged) {
        const effectiveKey =
          existingInvoice.invoiceNumberKey ?? normalizeInvoiceNumber(existingInvoice.invoiceNumber);
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

      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      return tx.invoice.update({
        where: { id },
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

    revalidatePath(protectedRoutes.invoices);
    revalidatePath(protectedRoutes.invoiceEdit(id));
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

// Delete invoice
export async function deleteInvoice(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: authResult.data.userId } },
      select: { status: true },
    });

    if (!invoice) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }

    if (invoice.status !== 'DRAFT') {
      return fail(
        'CONFLICT',
        'Only draft invoices can be deleted. Consider cancelling instead.',
      );
    }

    await prisma.invoice.delete({ where: { id } });
    revalidatePath(protectedRoutes.invoices);

    return ok();
  } catch (error) {
    return failed('Error deleting invoice:', error, 'Failed to delete invoice.');
  }
}

// Get invoice by ID
export async function getInvoice(
  id: string
): Promise<ActionResult<SerializedInvoice>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: authResult.data.userId } },
      include: {
        items: true,
        senderProfile: true,
        customer: true,
        bankAccount: true,
      },
    });

    if (!invoice) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }

    const serialized = serializeInvoice(invoice);
    if (!serialized) {
      return failed('Invoice serialize failed:', new Error(`Invoice ${id} could not be serialized`), 'Failed to serialize invoice.');
    }

    // AC-17's legacy flags (contracts/server-actions.md §getInvoiceEditorData / getInvoice, verbatim).
    const legacy = await computeInvoiceLegacyInfo(prisma, invoice);

    return ok({ ...serialized, legacy });
  } catch (error) {
    return failed('Error fetching invoice:', error, 'Failed to fetch invoice.');
  }
}

// Get all invoices list
export async function getInvoices(): Promise<ActionResult<InvoiceListItem[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const invoices = await prisma.invoice.findMany({
      where: { senderProfile: { userId: authResult.data.userId } },
      select: invoiceListSelect,
      orderBy: { createdAt: 'desc' },
    });

    return ok(
      invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
    );
  } catch (error) {
    return failed('Error fetching invoices:', error, 'Failed to fetch invoices.');
  }
}

// Get invoices by customer ID
export async function getInvoicesByCustomer(
  customerId: string,
  limit?: number
): Promise<ActionResult<InvoiceListItem[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        customerId,
        senderProfile: { userId: authResult.data.userId },
      },
      select: invoiceListSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return ok(
      invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
    );
  } catch (error) {
    return failed('Error fetching customer invoices:', error, 'Failed to fetch customer invoices.');
  }
}

// Get invoices by sender profile ID
export async function getInvoicesBySenderProfile(
  senderProfileId: string,
  limit?: number
): Promise<ActionResult<InvoiceListItem[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        senderProfileId,
        senderProfile: { userId: authResult.data.userId },
      },
      select: invoiceListSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return ok(
      invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
    );
  } catch (error) {
    return failed('Error fetching sender profile invoices:', error, 'Failed to fetch sender profile invoices.');
  }
}

// Update invoice status (Flow 8, list branch). Touches only status/paidAt: never runs the
// amount, number or legacy checks (AC-17 last sentence). The status/paid-date rule itself lives
// once in applyStatusChange (sad.md §8).
export async function updateInvoiceStatus(
  id: string,
  status: string
): Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const parsedStatus = z.nativeEnum(InvoiceStatus, {
      errorMap: () => ({ message: 'Unknown status.' }),
    }).safeParse(status);

    if (!parsedStatus.success) {
      return fail('VALIDATION', 'Unknown status.', {
        fieldErrors: { status: ['Unknown status.'] },
      });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: authResult.data.userId } },
      select: { status: true, paidAt: true },
    });

    if (!invoice) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }

    const { status: nextStatus, paidAt } = applyStatusChange(
      invoice,
      parsedStatus.data
    );

    await prisma.invoice.update({
      where: { id },
      data: { status: nextStatus, paidAt },
    });

    revalidatePath(protectedRoutes.invoices);
    revalidatePath(protectedRoutes.invoiceEdit(id));

    return ok({ status: nextStatus, paidAt: paidAt ? paidAt.toISOString() : null });
  } catch (error) {
    return failed('Error updating invoice status:', error, 'Failed to update invoice status.');
  }
}

// Get paginated invoices with filters and sorting. Takes already-parsed params from
// lib/validations/search-params.ts (contracts/server-actions.md §getPaginatedInvoices, verbatim):
// it no longer casts raw strings. Returns `applied` so the controls show what was actually used
// (AC-26), and clamps an out-of-range page to 1 once `total` is known (task file §Edge cases).
export async function getPaginatedInvoices(
  params: Partial<InvoiceListParams>
): Promise<ActionResult<PaginatedInvoiceList & { applied: InvoiceListParams }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const {
      page: requestedPage = 1,
      pageSize = 10,
      tab = 'all',
      search = '',
      status = 'all',
      customerId,
      senderProfileId,
      sortField = 'createdAt',
      sortDirection = 'desc',
      dateFrom,
      dateTo,
    } = params;

    const userId = authResult.data.userId;
    // Day boundaries use the validated browser time zone from the `tz` cookie, falling back to
    // UTC (sad.md §8 Hard rule "Time and time zones"; ADR-0010).
    const timeZone = await getRequestTimeZone();

    const baseWhere = {
      senderProfile: { userId },
    };

    const getTabStatusFilter = () => {
      if (tab === 'drafts') {
        return { status: 'DRAFT' as InvoiceStatus };
      }
      if (tab === 'final') {
        return { status: { not: 'DRAFT' as InvoiceStatus } };
      }
      return {};
    };

    const buildFilters = () => {
      const filters: Record<string, unknown> = {};

      if (search) {
        filters.OR = [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { senderName: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Status filter (only if not filtered by tab)
      if (status !== 'all' && tab === 'all') {
        filters.status = status;
      }

      if (customerId) {
        filters.customerId = customerId;
      }

      if (senderProfileId) {
        filters.senderProfileId = senderProfileId;
      }

      // Date bounds (contracts/server-actions.md §Link parameters, verbatim): [startOfDay(from,
      // tz), startOfDay(to + 1 day, tz)), so the last day is included in full and the end is
      // exclusive at the next local midnight (AC-27, ADR-0010).
      if (dateFrom && dateTo) {
        const [gte, lt] = localDayRange(dateFrom, dateTo, timeZone);
        filters.issueDate = { gte, lt };
      }

      return filters;
    };

    const tabFilter = getTabStatusFilter();
    const additionalFilters = buildFilters();

    const where = {
      ...baseWhere,
      ...tabFilter,
      ...additionalFilters,
    };

    const orderBy = {
      [sortField]: sortDirection,
    };

    // The clamp to page 1 (task file §Edge cases, "?page=999 beyond the last page") is only
    // knowable once `total` is counted, so the count and the page-scoped fetch are sequenced.
    const [total, totalInvoices, customers, senderProfiles] = await Promise.all([
      prisma.invoice.count({ where }),
      // Total invoices without any filters (for empty state detection)
      prisma.invoice.count({ where: baseWhere }),
      // Get unique customers for filter dropdown
      prisma.customer.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      // Get sender profiles for filter dropdown
      prisma.senderProfile.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    // F-32 (review-2026-09-27) — a filter matching zero invoices (`totalPages === 0`) used to
    // skip the clamp entirely (`totalPages > 0` was false), leaving an absurd requested page
    // (e.g. `?page=1e20`) unclamped and overflowing Prisma's `skip` below.
    const page = totalPages === 0 || requestedPage > totalPages ? 1 : requestedPage;

    const invoices = await prisma.invoice.findMany({
      where,
      select: invoiceListSelect,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const applied: InvoiceListParams = {
      page,
      pageSize,
      sortField,
      sortDirection,
      // F-33 (review-2026-09-27) — off the "all" tab, the tab controls the status filter and
      // `status` is ignored by the query (getTabStatusFilter/buildFilters above), so echoing the
      // raw requested status here would show a filter pill/Clear button for a filter that isn't
      // actually applied.
      status: tab === 'all' ? status : 'all',
      tab,
      customerId,
      senderProfileId,
      search,
      dateFrom: dateFrom && dateTo ? dateFrom : undefined,
      dateTo: dateFrom && dateTo ? dateTo : undefined,
    };

    return ok({
      invoices: invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
      total,
      page,
      pageSize,
      totalPages,
      filterOptions: {
        customers,
        senderProfiles,
      },
      totalInvoices,
      applied,
    });
  } catch (error) {
    return failed('Error fetching paginated invoices:', error, 'Failed to fetch invoices.');
  }
}

// Duplicate an existing invoice (Flow 6, duplicate branch, AC-12). In one transaction: allocate
// from the original's sender-profile sequence (same allocator and format as createInvoice),
// insert the copy with recomputed amounts, status DRAFT, paidAt null.
export async function duplicateInvoice(
  id: string
): Promise<ActionResult<{ id: string; invoiceNumber: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

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
        senderProfile.id
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

    revalidatePath(protectedRoutes.invoices);
    return ok({ id: newInvoice.id, invoiceNumber: newInvoice.invoiceNumber });
  } catch (error) {
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
