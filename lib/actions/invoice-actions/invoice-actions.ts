'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  invoiceFormSchema,
  InvoiceFormValues,
} from '@/lib/validations/invoice';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { ActionResult } from '@/types/actions';
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

// Generate invoice number based on sender profile prefix
export async function generateInvoiceNumber(
  senderProfileId: string
): Promise<ActionResult<string>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: authResult.data.userId },
      select: { invoicePrefix: true, invoiceCounter: true },
    });

    if (!profile) {
      return { success: false, error: 'Sender profile not found' };
    }

    const year = new Date().getFullYear();
    const invoiceNumber = `${profile.invoicePrefix}-${year}-${String(profile.invoiceCounter + 1).padStart(4, '0')}`;

    return { success: true, data: invoiceNumber };
  } catch (error) {
    console.error('Error generating invoice number:', error);
    return { success: false, error: 'Failed to generate invoice number' };
  }
}

// Get all data needed for invoice editor
export async function getInvoiceEditorData(
  invoiceId?: string
): Promise<ActionResult<InvoiceEditorData>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return {
      success: true,
      data: {
        senderProfiles: transformedProfiles,
        bankAccounts,
        customers: customers as InvoiceCustomer[],
        products: transformedProducts,
        customPrices: transformedCustomPrices,
        initialData: existingInvoice
          ? transformInvoiceToFormData(existingInvoice)
          : undefined,
        invoiceId,
      },
    };
  } catch (error) {
    console.error('Error fetching invoice editor data:', error);
    return { success: false, error: 'Failed to fetch invoice editor data' };
  }
}

// Create a new invoice
export async function createInvoice(
  data: InvoiceFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;
    const validatedData = invoiceFormSchema.parse(data);

    // Verify ownership and get snapshot data
    const relationsResult = await verifyInvoiceRelations(
      userId,
      validatedData.senderProfileId,
      validatedData.customerId,
      validatedData.bankAccountId
    );
    if (!relationsResult.success || !relationsResult.data) {
      return { success: false, error: relationsResult.error };
    }

    const { senderProfile, customer, bankAccount } = relationsResult.data;
    const { subtotal, taxAmount, total } = calculateInvoiceTotals(
      validatedData.items,
      validatedData.taxRate,
      validatedData.discount,
      validatedData.shipping
    );

    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber: validatedData.invoiceNumber,
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

      await tx.senderProfile.update({
        where: { id: senderProfile.id },
        data: { invoiceCounter: { increment: 1 } },
      });

      return createdInvoice;
    });

    revalidatePath(protectedRoutes.invoices);
    return { success: true, data: { id: invoice.id } };
  } catch (error) {
    console.error('Error creating invoice:', error);
    return { success: false, error: 'Failed to create invoice' };
  }
}

// Update an existing invoice
export async function updateInvoice(
  id: string,
  data: InvoiceFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;
    const validatedData = invoiceFormSchema.parse(data);

    // Verify invoice exists
    const existingInvoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId } },
    });
    if (!existingInvoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Verify ownership and get snapshot data
    const relationsResult = await verifyInvoiceRelations(
      userId,
      validatedData.senderProfileId,
      validatedData.customerId,
      validatedData.bankAccountId
    );
    if (!relationsResult.success || !relationsResult.data) {
      return { success: false, error: relationsResult.error };
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
    return { success: true, data: { id: invoice.id } };
  } catch (error) {
    console.error('Error updating invoice:', error);
    return { success: false, error: 'Failed to update invoice' };
  }
}

// Delete invoice
export async function deleteInvoice(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: authResult.data.userId } },
      select: { status: true },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    if (invoice.status !== 'DRAFT') {
      return {
        success: false,
        error:
          'Only draft invoices can be deleted. Consider cancelling instead.',
      };
    }

    await prisma.invoice.delete({ where: { id } });
    revalidatePath(protectedRoutes.invoices);

    return { success: true };
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return { success: false, error: 'Failed to delete invoice' };
  }
}

// Get invoice by ID
export async function getInvoice(
  id: string
): Promise<ActionResult<SerializedInvoice>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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
      return { success: false, error: 'Invoice not found' };
    }

    const serialized = serializeInvoice(invoice);
    if (!serialized) {
      return { success: false, error: 'Failed to serialize invoice' };
    }

    return { success: true, data: serialized };
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return { success: false, error: 'Failed to fetch invoice' };
  }
}

// Get all invoices list
export async function getInvoices(): Promise<ActionResult<InvoiceListItem[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const invoices = await prisma.invoice.findMany({
      where: { senderProfile: { userId: authResult.data.userId } },
      select: invoiceListSelect,
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
    };
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return { success: false, error: 'Failed to fetch invoices' };
  }
}

// Get invoices by customer ID
export async function getInvoicesByCustomer(
  customerId: string,
  limit?: number
): Promise<ActionResult<InvoiceListItem[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return {
      success: true,
      data: invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
    };
  } catch (error) {
    console.error('Error fetching customer invoices:', error);
    return { success: false, error: 'Failed to fetch customer invoices' };
  }
}

// Get invoices by sender profile ID
export async function getInvoicesBySenderProfile(
  senderProfileId: string,
  limit?: number
): Promise<ActionResult<InvoiceListItem[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return {
      success: true,
      data: invoices.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
    };
  } catch (error) {
    console.error('Error fetching sender profile invoices:', error);
    return { success: false, error: 'Failed to fetch sender profile invoices' };
  }
}

// Update invoice status
export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: authResult.data.userId } },
      select: { id: true },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    await prisma.invoice.update({
      where: { id },
      data: { status, ...(status === 'PAID' && { paidAt: new Date() }) },
    });

    revalidatePath(protectedRoutes.invoices);
    revalidatePath(protectedRoutes.invoiceEdit(id));

    return { success: true };
  } catch (error) {
    console.error('Error updating invoice status:', error);
    return { success: false, error: 'Failed to update invoice status' };
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
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return {
      success: true,
      data: {
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
      },
    };
  } catch (error) {
    console.error('Error fetching paginated invoices:', error);
    return { success: false, error: 'Failed to fetch invoices' };
  }
}

export async function duplicateInvoice(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;

    const originalInvoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId } },
      include: { items: true },
    });

    if (!originalInvoice) {
      return { success: false, error: 'Invoice not found' };
    }

    const senderProfile = await prisma.senderProfile.findFirst({
      where: { id: originalInvoice.senderProfileId, userId },
      select: { invoicePrefix: true, invoiceCounter: true },
    });

    if (!senderProfile) {
      return { success: false, error: 'Sender profile not found' };
    }

    const year = new Date().getFullYear();
    const newInvoiceNumber = `${senderProfile.invoicePrefix}-${year}-${String(senderProfile.invoiceCounter + 1).padStart(4, '0')}`;

    const newInvoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber: newInvoiceNumber,
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
          subtotal: originalInvoice.subtotal,
          taxRate: originalInvoice.taxRate,
          taxAmount: originalInvoice.taxAmount,
          discount: originalInvoice.discount,
          shipping: originalInvoice.shipping,
          total: originalInvoice.total,
          amountPaid: 0,
          notes: originalInvoice.notes,
          terms: originalInvoice.terms,
          items: {
            create: originalInvoice.items.map((item) => ({
              productId: item.productId,
              name: item.name,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
              currency: item.currency,
            })),
          },
        },
      });

      await tx.senderProfile.update({
        where: { id: originalInvoice.senderProfileId },
        data: { invoiceCounter: { increment: 1 } },
      });

      return created;
    });

    revalidatePath(protectedRoutes.invoices);
    return { success: true, data: { id: newInvoice.id } };
  } catch (error) {
    console.error('Error duplicating invoice:', error);
    return { success: false, error: 'Failed to duplicate invoice' };
  }
}
