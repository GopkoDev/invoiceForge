'use server';

import { InvoiceFormInput } from '@/lib/validations/invoice';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { ActionResult, ok } from '@/types/actions';
import {
  InvoiceEditorData,
  SerializedInvoice,
  InvoiceListItem,
  PaginatedInvoiceList,
} from '@/types/invoice/types';
import type { InvoiceStatus } from '@prisma/client';
import { InvoiceListParams } from '@/lib/validations/search-params';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as invoiceReads from '@/lib/services/invoices/invoices';
import { type SavedInvoice as ServiceSavedInvoice } from '@/lib/services/invoices/invoices';
import * as editorData from '@/lib/services/invoices/editor-data';

// A type alias, not `export type { … }`: Next's 'use server' transform treats a re-export as an action export and the build fails.
export type SavedInvoice = ServiceSavedInvoice;

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
  data: InvoiceFormInput
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
  data: InvoiceFormInput & { loadedVersion?: number }
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
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.deleteInvoice(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.invoices);
  return result;
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
  const result = await invoiceReads.listInvoices(actor.data, { customerId, ...(limit ? { page: 1, pageSize: limit } : {}) });
  if (!result.success) {
    return result.code === 'FAILED' ? { ...result, error: 'Failed to fetch customer invoices.' } : result;
  }
  return ok(result.data.items);
}

// Get invoices by sender profile ID
export async function getInvoicesBySenderProfile(
  senderProfileId: string,
  limit?: number
): Promise<ActionResult<InvoiceListItem[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.listInvoices(actor.data, { senderProfileId, ...(limit ? { page: 1, pageSize: limit } : {}) });
  if (!result.success) {
    return result.code === 'FAILED' ? { ...result, error: 'Failed to fetch sender profile invoices.' } : result;
  }
  return ok(result.data.items);
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

// Duplicate an existing invoice (Flow 8, AC-24)
export async function duplicateInvoice(
  id: string
): Promise<ActionResult<{ id: string; invoiceNumber: string }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await invoiceReads.duplicateInvoice(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.invoices);
  return result;
}
