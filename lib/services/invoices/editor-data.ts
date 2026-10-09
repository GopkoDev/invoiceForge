import 'server-only';
import type { Invoice } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import type {
  InvoiceBankAccount,
  InvoiceCustomPrice,
  InvoiceCustomer,
  InvoiceEditorData,
  InvoiceIssuedDetails,
  InvoiceProduct,
  InvoiceSenderProfile,
} from '@/types/invoice/types';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { isDerivedOverdue, todayIn } from '@/lib/services/_shared/overdue';
import { failed } from '@/lib/services/_shared/result-helpers';
import {
  bankAccountSelect,
  customPriceSelect,
  customerSelect,
  productSelect,
  senderProfileSelect,
} from '@/lib/services/invoices/select-queries';
import {
  INVOICE_ITEM_ORDER,
  computeInvoiceLegacyInfo,
  serializeDecimal,
  transformInvoiceToFormData,
} from '@/lib/services/invoices/helpers';

/** Everything the new/edit invoice editor needs (AC-25: includes the Customer's custom prices). */
export async function getInvoiceEditorData(
  actor: ActingFreelancer,
  invoiceId?: string,
): Promise<ActionResult<InvoiceEditorData>> {
  try {
    const userId = actor.userId;

    const [senderProfiles, customers, products, customPrices, existingInvoice] = await Promise.all([
      prisma.senderProfile.findMany({
        where: { userId },
        select: { ...senderProfileSelect, bankAccounts: { select: bankAccountSelect, orderBy: { id: 'asc' } } },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.customer.findMany({ where: { userId }, select: customerSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      // invoice-integrity T16 (AC-15): active products, plus every product the invoice's lines refer
      // to, active or not. The editor offers only active ones for new lines and keeps every line.
      prisma.product.findMany({
        where: invoiceId
          ? { userId, OR: [{ isActive: true }, { invoiceItems: { some: { invoiceId } } }] }
          : { userId, isActive: true },
        select: productSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.customPrice.findMany({ where: { product: { userId } }, select: customPriceSelect,
        orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
      }),
      invoiceId
        ? prisma.invoice.findFirst({
            where: { id: invoiceId, senderProfile: { userId } },
            include: { items: { orderBy: INVOICE_ITEM_ORDER } },
          })
        : null,
    ]);

    if (invoiceId && !existingInvoice) return fail('NOT_FOUND', 'Invoice not found.');

    const bankAccounts: InvoiceBankAccount[] = senderProfiles.flatMap((p) => p.bankAccounts);

    const transformedProducts: InvoiceProduct[] = products.map((p) => ({
      ...p,
      price: serializeDecimal(p.price),
    }));
    const transformedCustomPrices: InvoiceCustomPrice[] = customPrices.map((cp) => ({
      ...cp,
      price: serializeDecimal(cp.price),
    }));
    const transformedProfiles: InvoiceSenderProfile[] = senderProfiles.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ bankAccounts: _bankAccounts, ...profile }) => profile,
    );

    const legacy = existingInvoice ? await computeInvoiceLegacyInfo(prisma, existingInvoice) : null;

    return ok({
      senderProfiles: transformedProfiles,
      bankAccounts,
      customers: customers as InvoiceCustomer[],
      products: transformedProducts,
      customPrices: transformedCustomPrices,
      // The editor gets the stored status (a save echoes it back); the derived badge travels beside it.
      initialData: existingInvoice ? transformInvoiceToFormData(existingInvoice) : undefined,
      derivedOverdue: existingInvoice ? isDerivedOverdue(existingInvoice, todayIn(actor.timeZone)) : undefined,
      invoiceId,
      legacy,
      version: existingInvoice?.version,
      issuedDetails: existingInvoice ? issuedDetailsOf(existingInvoice) : null,
    });
  } catch (error) {
    return failed('Error fetching invoice editor data:', error, 'Failed to fetch invoice editor data.');
  }
}

/** The invoice's snapshot columns as the editor's read-only issued blocks (ADR-0001). */
export function issuedDetailsOf(invoice: Invoice): InvoiceIssuedDetails {
  return {
    sender: {
      name: invoice.senderName,
      legalName: invoice.senderLegalName,
      taxId: invoice.senderTaxId,
      address: invoice.senderAddress,
      city: invoice.senderCity,
      country: invoice.senderCountry,
      postalCode: invoice.senderPostalCode,
      phone: invoice.senderPhone,
      email: invoice.senderEmail,
      website: invoice.senderWebsite,
    },
    customer: {
      name: invoice.customerName,
      companyName: invoice.customerCompanyName,
      taxId: invoice.customerTaxId,
      email: invoice.customerEmail,
      phone: invoice.customerPhone,
      address: invoice.customerAddress,
      city: invoice.customerCity,
      country: invoice.customerCountry,
      postalCode: invoice.customerPostalCode,
    },
    bank: {
      bankName: invoice.bankName,
      accountName: invoice.accountName,
      accountNumber: invoice.bankAccountNumber,
      iban: invoice.bankIban,
      swift: invoice.bankSwift,
    },
  };
}
