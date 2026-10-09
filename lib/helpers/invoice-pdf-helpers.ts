import { fetchLogoDataUrl } from '@/lib/utils/image-to-base64';
import { storedDayToLocalDate } from '@/lib/helpers/calendar-day';
import type {
  SerializedInvoice,
  InvoiceFormData,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
} from '@/types/invoice/types';

export interface InvoicePdfData {
  formData: InvoiceFormData;
  senderProfile: InvoiceSenderProfile | null;
  customer: InvoiceCustomer | null;
  bankAccount: InvoiceBankAccount | null;
}

/**
 * Outcome of building the PDF's logo (T06, AC-01/AC-03, screens.md §SCR-04): either a data
 * URL to embed, a plain-language warning to show alongside a logo-less PDF, or an
 * unauthorized signal (401 -> SCR-01) that skips PDF generation entirely so the caller can
 * redirect to sign-in.
 */
export interface LogoForPdf {
  logoBase64: string | null;
  warning?: string;
  unauthorized?: boolean;
}

export async function resolveLogoForPdf(
  senderProfile: InvoiceSenderProfile | null | undefined
): Promise<LogoForPdf> {
  if (!senderProfile?.logo) {
    return { logoBase64: null };
  }

  const result = await fetchLogoDataUrl(senderProfile.id, senderProfile.logo);

  if ('dataUrl' in result) {
    return { logoBase64: result.dataUrl };
  }
  if ('unauthorized' in result) {
    return { logoBase64: null, unauthorized: true };
  }
  return { logoBase64: null, warning: result.warning };
}

/**
 * Prepares invoice data for PDF generation. invoice-integrity T14 (ADR-0001, AC-01, AC-03): the
 * sender, Customer and bank blocks come from the invoice's issued details (its snapshot columns),
 * never the current records; only the logo is the current sender profile's (spec §3). The
 * relation-only fields the PDF never prints are filled from the ids and the invoice itself.
 */
export function prepareInvoiceDataForPdf(
  invoice: SerializedInvoice
): InvoicePdfData {
  const senderProfile: InvoiceSenderProfile = {
    id: invoice.senderProfileId,
    name: invoice.senderName,
    legalName: invoice.senderLegalName,
    address: invoice.senderAddress,
    city: invoice.senderCity,
    country: invoice.senderCountry,
    postalCode: invoice.senderPostalCode,
    email: invoice.senderEmail,
    phone: invoice.senderPhone,
    taxId: invoice.senderTaxId,
    logo: invoice.senderProfile?.logo ?? null,
    invoicePrefix: invoice.senderProfile?.invoicePrefix ?? '',
    invoiceCounter: invoice.senderProfile?.invoiceCounter ?? 0,
  };

  const customer: InvoiceCustomer = {
    id: invoice.customerId,
    name: invoice.customerName,
    companyName: invoice.customerCompanyName,
    email: invoice.customerEmail,
    address: invoice.customerAddress,
    city: invoice.customerCity,
    country: invoice.customerCountry,
    postalCode: invoice.customerPostalCode,
    phone: invoice.customerPhone,
    taxId: invoice.customerTaxId,
    defaultCurrency: invoice.currency,
  };

  const bankAccount: InvoiceBankAccount = {
    id: invoice.bankAccountId,
    senderProfileId: invoice.senderProfileId,
    bankName: invoice.bankName,
    accountName: invoice.accountName ?? '',
    accountNumber: invoice.bankAccountNumber ?? '',
    iban: invoice.bankIban || null,
    swift: invoice.bankSwift || null,
    currency: invoice.currency,
    isDefault: false,
  };

  const formData: InvoiceFormData = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    senderProfileId: invoice.senderProfileId,
    bankAccountId: invoice.bankAccountId || '',
    customerId: invoice.customerId,
    // A stored day (UTC midnight) as the local Date with the same Y/M/D, which date-fns formats as-is.
    issueDate: storedDayToLocalDate(invoice.issueDate),
    dueDate: storedDayToLocalDate(invoice.dueDate),
    currency: invoice.currency,
    poNumber: invoice.poNumber || '',
    paymentTerms: invoice.paymentTerms || '',
    items: invoice.items.map((item) => ({
      id: item.id,
      productId: item.productId || '',
      productName: item.name,
      description: item.description || '',
      unit: item.unit,
      quantity: item.quantity,
      price: item.rate,
      total: item.amount,
    })),
    taxRate: invoice.taxRate,
    discount: invoice.discount,
    shipping: invoice.shipping,
    notes: invoice.notes || '',
    terms: invoice.terms || '',
  };

  return { formData, senderProfile, customer, bankAccount };
}
