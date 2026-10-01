'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  invoiceAmountsSchema,
  InvoiceFormValues,
} from '@/lib/validations/invoice';
import { revalidatePath } from 'next/cache';
import { captureMessage } from '@sentry/nextjs';
import { protectedRoutes } from '@/config/routes.config';
import { ActionResult, ok, fail } from '@/types/actions';
import {
  isUniqueConstraintError,
  failed,
} from '@/lib/actions/action-result-helpers';
import {
  InvoiceEditorData,
  SerializedInvoice,
  InvoiceListItem,
  PaginatedInvoiceList,
} from '@/types/invoice/types';
import { InvoiceStatus } from '@prisma/client';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';
import { InvoiceListParams } from '@/lib/validations/search-params';
import {
  allocateInvoiceNumber,
} from './numbering';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as invoiceReads from '@/lib/services/invoices/invoices';
import { type SavedInvoice } from '@/lib/services/invoices/invoices';
import * as editorData from '@/lib/services/invoices/editor-data';

import {
  transformInvoiceToFormData,
} from './helpers';

export type { SavedInvoice };

// Returns the next proposed invoice number as a hint only (AC-06).
export async function generateInvoiceNumber(
  senderProfileId: string
): Promise<ActionResult<string>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return invoiceReads.peekNextInvoiceNumber(actor.data, senderProfileId);
}

// Get all data needed for invoice editor
export async function getInvoiceEditorData(
  invoiceId?: string
): Promise<ActionResult<InvoiceEditorData>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await editorData.getInvoiceEditorData(actor.data, invoiceId);
  if (!result.success && result.code === 'NOT_FOUND' && invoiceId) {
    // Parity: a missing or foreign invoice id yields the editor data without initialData, and the
    // edit page calls notFound() on it.
    const base = await editorData.getInvoiceEditorData(actor.data);
    if (!base.success) return base;
    return { success: true, data: { ...base.data, invoiceId } };
  }
  return result;
}

// Create a new invoice (Flow 2): the web wrapper — session, then the business function, then the
// page refresh on success.
export async function createInvoice(
  data: InvoiceFormValues
): Promise<ActionResult<SavedInvoice>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.createInvoice(actor.data, data);
  if (result.success) revalidatePath(protectedRoutes.invoices);
  return result;
}

// Update an existing invoice: the web wrapper — session, then the business function, then the
// page refresh on success.
export async function updateInvoice(
  id: string,
  data: InvoiceFormValues
): Promise<ActionResult<SavedInvoice>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.updateInvoice(actor.data, id, data);
  if (result.success) {
    revalidatePath(protectedRoutes.invoices);
    revalidatePath(protectedRoutes.invoiceEdit(id));
  }
  return result;
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
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return invoiceReads.getInvoice(actor.data, id);
}

// Get invoices by customer ID
export async function getInvoicesByCustomer(
  customerId: string,
  limit?: number
): Promise<ActionResult<InvoiceListItem[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.listInvoices(actor.data, { customerId, page: 1, pageSize: limit });
  return result.success ? ok(result.data.items) : result;
}

// Get invoices by sender profile ID
export async function getInvoicesBySenderProfile(
  senderProfileId: string,
  limit?: number
): Promise<ActionResult<InvoiceListItem[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.listInvoices(actor.data, { senderProfileId, page: 1, pageSize: limit });
  return result.success ? ok(result.data.items) : result;
}

// Update invoice status (Flow 8, list branch): the web wrapper.
export async function updateInvoiceStatus(
  id: string,
  status: string
): Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.updateInvoiceStatus(actor.data, id, status);
  if (result.success) {
    revalidatePath(protectedRoutes.invoices);
    revalidatePath(protectedRoutes.invoiceEdit(id));
  }
  return result;
}

// Get paginated invoices with filters and sorting. Takes already-parsed params from
// lib/validations/search-params.ts (contracts/server-actions.md §getPaginatedInvoices, verbatim):
// it no longer casts raw strings. Returns `applied` so the controls show what was actually used
// (AC-26), and clamps an out-of-range page to 1 once `total` is known (task file §Edge cases).
export async function getPaginatedInvoices(
  params: Partial<InvoiceListParams>
): Promise<ActionResult<PaginatedInvoiceList & { applied: InvoiceListParams }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

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

  const result = await invoiceReads.listInvoices(actor.data, {
    page: requestedPage,
    pageSize,
    tab,
    search,
    status,
    customerId,
    senderProfileId,
    sortField,
    sortDirection,
    // The page's link parser already drops a half or reversed range; only a full one is applied.
    ...(dateFrom && dateTo ? { dateFrom, dateTo } : {}),
  });
  if (!result.success) return result;

  const { items, total, page, totalPages, filterOptions, totalInvoices } = result.data;
  const applied: InvoiceListParams = {
    page,
    pageSize,
    sortField,
    sortDirection,
    // F-33 (review-2026-09-27) — off the "all" tab, the tab controls the status filter and
    // `status` is ignored by the query, so echo 'all' rather than a filter that isn't applied.
    status: tab === 'all' ? status : 'all',
    tab,
    customerId,
    senderProfileId,
    search,
    dateFrom: dateFrom && dateTo ? dateFrom : undefined,
    dateTo: dateFrom && dateTo ? dateTo : undefined,
  };

  return ok({
    invoices: items,
    total,
    page,
    pageSize,
    totalPages,
    filterOptions,
    totalInvoices,
    applied,
  });
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
