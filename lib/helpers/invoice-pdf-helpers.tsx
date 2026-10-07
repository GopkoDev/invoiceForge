import { pdf } from '@react-pdf/renderer';
import { toast } from 'sonner';
import { InvoicePDFDocument } from '@/components/invoice-editor/invoice-pdf-document';
import { fetchLogoDataUrl } from '@/lib/utils/image-to-base64';
import { siteConfig } from '@/config/site.config';
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
interface LogoForPdf {
  logoBase64: string | null;
  warning?: string;
  unauthorized?: boolean;
}

async function resolveLogoForPdf(
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

/** Result of generating a PDF blob (T06 checklist: download/print show the AC-03 warning via
 * `toast.warning`, or redirect to sign-in on `unauthorized`, before ever touching the DOM). */
export interface GeneratePdfResult {
  blob: Blob | null;
  warning?: string;
  unauthorized?: boolean;
}

/** Result of the download/print side-effects (opening a link, printing). */
export interface InvoicePdfActionResult {
  success: boolean;
  unauthorized?: boolean;
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

/**
 * Generates PDF blob from invoice data
 */
export async function generateInvoicePdfBlob(
  invoice: SerializedInvoice,
  invoiceData?: InvoicePdfData
): Promise<GeneratePdfResult> {
  const data = invoiceData ?? prepareInvoiceDataForPdf(invoice);

  const logo = await resolveLogoForPdf(data.senderProfile);
  if (logo.unauthorized) {
    return { blob: null, unauthorized: true };
  }

  const doc = (
    <InvoicePDFDocument
      formData={data.formData}
      senderProfile={data.senderProfile ?? undefined}
      customer={data.customer ?? undefined}
      bankAccount={data.bankAccount ?? undefined}
      subtotal={invoice.subtotal}
      taxAmount={invoice.taxAmount}
      total={invoice.total}
      logoBase64={logo.logoBase64}
    />
  );

  const blob = await pdf(doc).toBlob();
  return { blob, warning: logo.warning };
}

/**
 * Downloads invoice as PDF
 */
export async function downloadInvoicePdf(
  invoice: SerializedInvoice,
  invoiceData?: InvoicePdfData
): Promise<InvoicePdfActionResult> {
  try {
    const { blob, warning, unauthorized } = await generateInvoicePdfBlob(
      invoice,
      invoiceData
    );
    if (unauthorized) return { success: false, unauthorized: true };
    if (!blob) {
      toast.error('Failed to download PDF');
      return { success: false };
    }
    if (warning) toast.warning(warning);

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoice.invoiceNumber}(${siteConfig.branding.domain}).pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    toast.success('PDF downloaded successfully');
    return { success: true };
  } catch (error) {
    console.error('Error downloading PDF:', error);
    toast.error('Failed to download PDF');
    return { success: false };
  }
}

/**
 * Opens invoice PDF in new window for printing
 */
export async function printInvoicePdf(
  invoice: SerializedInvoice,
  invoiceData?: InvoicePdfData
): Promise<InvoicePdfActionResult> {
  try {
    const { blob, warning, unauthorized } = await generateInvoicePdfBlob(
      invoice,
      invoiceData
    );
    if (unauthorized) return { success: false, unauthorized: true };
    if (!blob) {
      toast.error('Failed to print PDF');
      return { success: false };
    }
    if (warning) toast.warning(warning);

    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url);
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
        URL.revokeObjectURL(url);
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error printing PDF:', error);
    toast.error('Failed to print PDF');
    return { success: false };
  }
}

/**
 * Generates PDF blob directly from form data (for invoice editor)
 */
export async function generatePdfBlobFromFormData(
  formData: InvoiceFormData,
  senderProfile: InvoiceSenderProfile | undefined,
  customer: InvoiceCustomer | undefined,
  bankAccount: InvoiceBankAccount | undefined,
  subtotal: number,
  taxAmount: number,
  total: number
): Promise<GeneratePdfResult> {
  const logo = await resolveLogoForPdf(senderProfile);
  if (logo.unauthorized) {
    return { blob: null, unauthorized: true };
  }

  const doc = (
    <InvoicePDFDocument
      formData={formData}
      senderProfile={senderProfile}
      customer={customer}
      bankAccount={bankAccount}
      subtotal={subtotal}
      taxAmount={taxAmount}
      total={total}
      logoBase64={logo.logoBase64}
    />
  );

  const blob = await pdf(doc).toBlob();
  return { blob, warning: logo.warning };
}

/**
 * Downloads PDF directly from form data
 */
export async function downloadPdfFromFormData(
  formData: InvoiceFormData,
  senderProfile: InvoiceSenderProfile | undefined,
  customer: InvoiceCustomer | undefined,
  bankAccount: InvoiceBankAccount | undefined,
  subtotal: number,
  taxAmount: number,
  total: number
): Promise<InvoicePdfActionResult> {
  try {
    const { blob, warning, unauthorized } = await generatePdfBlobFromFormData(
      formData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
    if (unauthorized) return { success: false, unauthorized: true };
    if (!blob) {
      toast.error('Error generating PDF');
      return { success: false };
    }
    if (warning) toast.warning(warning);

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${formData.invoiceNumber || 'invoice'}(${siteConfig.branding.domain}).pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('PDF downloaded');
    return { success: true };
  } catch (error) {
    console.error('Error downloading PDF:', error);
    toast.error('Error generating PDF');
    return { success: false };
  }
}

/**
 * Opens PDF in new window for printing directly from form data
 */
export async function printPdfFromFormData(
  formData: InvoiceFormData,
  senderProfile: InvoiceSenderProfile | undefined,
  customer: InvoiceCustomer | undefined,
  bankAccount: InvoiceBankAccount | undefined,
  subtotal: number,
  taxAmount: number,
  total: number
): Promise<InvoicePdfActionResult> {
  try {
    const { blob, warning, unauthorized } = await generatePdfBlobFromFormData(
      formData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
    if (unauthorized) return { success: false, unauthorized: true };
    if (!blob) {
      toast.error('Error generating PDF');
      return { success: false };
    }
    if (warning) toast.warning(warning);

    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url);
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
        URL.revokeObjectURL(url);
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error printing PDF:', error);
    toast.error('Error generating PDF');
    return { success: false };
  }
}
