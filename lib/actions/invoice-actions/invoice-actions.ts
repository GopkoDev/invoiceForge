'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  invoiceFormSchema,
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
  InvoiceTab,
  InvoiceSortField,
  SortDirection,
} from '@/types/invoice/types';
import { InvoiceStatus } from '@prisma/client';
import { applyStatusChange } from '@/lib/helpers/invoice-status';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';
import {
  allocateInvoiceNumber,
  isInvoiceKeyTaken,
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
  calculateInvoiceTotals,
  buildSenderSnapshot,
  buildCustomerSnapshot,
  buildBankAccountSnapshot,
  buildInvoiceItems,
  transformInvoiceToFormData,
  verifyInvoiceRelations,
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
    console.error('Error generating invoice number:', error);
    return fail('FAILED', 'Failed to generate invoice number.');
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
    });
  } catch (error) {
    console.error('Error fetching invoice editor data:', error);
    return fail('FAILED', 'Failed to fetch invoice editor data.');
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

    const { senderProfile, customer, bankAccount } = relationsResult.data;

    const invoice = await prisma.$transaction(async (tx) => {
      let invoiceNumber: string;
      let invoiceNumberKey: string;

      if (validatedData.invoiceNumber === '') {
        wasAllocated = true;
        ({ invoiceNumber, invoiceNumberKey } = await allocateInvoiceNumber(
          tx,
          senderProfile.id
        ));
      } else {
        invoiceNumber = validatedData.invoiceNumber;
        invoiceNumberKey = normalizeInvoiceNumber(invoiceNumber);
        if (await isInvoiceKeyTaken(tx, senderProfile.id, invoiceNumberKey)) {
          throw new InvoiceNumberConflictError();
        }
      }

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
        captureMessage('invoice_number_conflict', { extra: { data } });
      }
      return invoiceNumberConflict();
    }
    console.error('Error creating invoice:', error);
    return fail('FAILED', 'Failed to create invoice.');
  }
}

// Update an existing invoice
export async function updateInvoice(
  id: string,
  data: InvoiceFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = invoiceFormSchema.parse(data);

    // Verify invoice exists
    const existingInvoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId } },
    });
    if (!existingInvoice) {
      return fail('NOT_FOUND', 'Invoice not found.');
    }

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

    const { senderProfile, customer, bankAccount } = relationsResult.data;
    const { subtotal, taxAmount, total } = calculateInvoiceTotals(
      validatedData.items,
      validatedData.taxRate,
      validatedData.discount,
      validatedData.shipping
    );

    // If sender profile changed, generate a new invoice number to avoid conflicts
    let invoiceNumber = validatedData.invoiceNumber;
    if (validatedData.senderProfileId !== existingInvoice.senderProfileId) {
      const newNumberResult = await generateInvoiceNumber(
        validatedData.senderProfileId
      );
      if (newNumberResult.success && newNumberResult.data) {
        invoiceNumber = newNumberResult.data;
      }
    }

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      return tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber,
          senderProfileId: validatedData.senderProfileId,
          customerId: validatedData.customerId,
          bankAccountId: validatedData.bankAccountId,
          issueDate: validatedData.issueDate,
          dueDate: validatedData.dueDate,
          paymentTerms: validatedData.paymentTerms,
          status: validatedData.status,
          currency: validatedData.currency,
          poNumber: validatedData.poNumber,
          ...buildSenderSnapshot(senderProfile),
          ...buildCustomerSnapshot(customer),
          ...buildBankAccountSnapshot(bankAccount),
          subtotal,
          taxRate: validatedData.taxRate,
          taxAmount,
          discount: validatedData.discount,
          shipping: validatedData.shipping,
          total,
          notes: validatedData.notes,
          terms: validatedData.terms,
          items: { create: buildInvoiceItems(validatedData.items) },
        },
      });
    });

    revalidatePath(protectedRoutes.invoices);
    revalidatePath(protectedRoutes.invoiceEdit(id));
    return ok({ id: invoice.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    if (isUniqueConstraintError(error)) {
      return fail(
        'CONFLICT',
        'This invoice number is already used in this sender profile.',
        { fieldErrors: { invoiceNumber: ['This invoice number is already used in this sender profile.'] } },
      );
    }
    console.error('Error updating invoice:', error);
    return fail('FAILED', 'Failed to update invoice.');
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
    console.error('Error deleting invoice:', error);
    return fail('FAILED', 'Failed to delete invoice.');
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
      return fail('FAILED', 'Failed to serialize invoice.');
    }

    return ok(serialized);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return fail('FAILED', 'Failed to fetch invoice.');
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
    console.error('Error fetching invoices:', error);
    return fail('FAILED', 'Failed to fetch invoices.');
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
    console.error('Error fetching customer invoices:', error);
    return fail('FAILED', 'Failed to fetch customer invoices.');
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
    console.error('Error fetching sender profile invoices:', error);
    return fail('FAILED', 'Failed to fetch sender profile invoices.');
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
    console.error('Error updating invoice status:', error);
    return fail('FAILED', 'Failed to update invoice status.');
  }
}

// Get paginated invoices with filters and sorting
export async function getPaginatedInvoices(params: {
  page?: number;
  pageSize?: number;
  tab?: InvoiceTab;
  search?: string;
  status?: InvoiceStatus | 'all';
  customerId?: string;
  senderProfileId?: string;
  sortField?: InvoiceSortField;
  sortDirection?: SortDirection;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ActionResult<PaginatedInvoiceList>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const {
      page = 1,
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

      if (dateFrom) {
        filters.issueDate = {
          ...((filters.issueDate as object) || {}),
          gte: new Date(dateFrom),
        };
      }
      if (dateTo) {
        filters.issueDate = {
          ...((filters.issueDate as object) || {}),
          lte: new Date(dateTo),
        };
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

    const [invoices, total, totalInvoices, customers, senderProfiles] =
      await Promise.all([
        prisma.invoice.findMany({
          where,
          select: invoiceListSelect,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
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

    return ok({
      invoices: invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      filterOptions: {
        customers,
        senderProfiles,
      },
      totalInvoices,
    });
  } catch (error) {
    console.error('Error fetching paginated invoices:', error);
    return fail('FAILED', 'Failed to fetch invoices.');
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

    // Stored amounts come only from the shared exact-decimal module (ADR-0006), recomputed from
    // the original's quantity x rate rather than copying its (possibly stale) stored figures.
    const amounts = computeInvoiceAmounts({
      items: originalInvoice.items.map((item) => ({
        quantity: item.quantity.toString(),
        price: item.rate.toString(),
      })),
      discount: originalInvoice.discount.toString(),
      shipping: originalInvoice.shipping.toString(),
      taxRate: originalInvoice.taxRate.toString(),
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
      return fail(
        'CONFLICT',
        'This invoice number is already used in this sender profile.',
        { fieldErrors: { invoiceNumber: ['This invoice number is already used in this sender profile.'] } },
      );
    }
    console.error('Error duplicating invoice:', error);
    return fail('FAILED', 'Failed to duplicate invoice.');
  }
}
