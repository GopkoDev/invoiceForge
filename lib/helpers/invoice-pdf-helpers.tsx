import { pdf } from '@react-pdf/renderer';
import { toast } from 'sonner';
import { InvoicePDFDocument } from '@/components/invoice-editor/invoice-pdf-document';
import { convertLogoToBase64 } from '@/lib/utils/image-to-base64';
import { siteConfig } from '@/config/site.config';
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
 * Prepares invoice data for PDF generation
 */
export function prepareInvoiceDataForPdf(
  invoice: SerializedInvoice
): InvoicePdfData {
  const senderProfile: InvoiceSenderProfile | null = invoice.senderProfile
    ? {
        id: invoice.senderProfile.id,
        name: invoice.senderProfile.name,
        legalName: invoice.senderProfile.legalName,
        address: invoice.senderProfile.address,
        city: invoice.senderProfile.city,
        country: invoice.senderProfile.country,
        postalCode: invoice.senderProfile.postalCode,
        email: invoice.senderProfile.email,
        phone: invoice.senderProfile.phone,
        taxId: invoice.senderProfile.taxId,
        logo: invoice.senderProfile.logo,
        invoicePrefix: invoice.senderProfile.invoicePrefix,
        invoiceCounter: invoice.senderProfile.invoiceCounter,
      }
    : null;

  const customer: InvoiceCustomer | null = invoice.customer
    ? {
        id: invoice.customer.id,
        name: invoice.customer.name,
        companyName: invoice.customer.companyName,
        email: invoice.customer.email,
        address: invoice.customer.address,
        city: invoice.customer.city,
        country: invoice.customer.country,
        postalCode: invoice.customer.postalCode,
        phone: invoice.customer.phone,
        taxId: invoice.customer.taxId,
        defaultCurrency: invoice.customer.defaultCurrency,
      }
    : null;

  const bankAccount: InvoiceBankAccount | null = invoice.bankAccount
    ? {
        id: invoice.bankAccount.id,
        senderProfileId: invoice.bankAccount.senderProfileId,
        bankName: invoice.bankAccount.bankName,
        accountName: invoice.bankAccount.accountName ?? '',
        accountNumber: invoice.bankAccount.accountNumber ?? '',
        iban: invoice.bankAccount.iban,
        swift: invoice.bankAccount.swift,
        currency: invoice.bankAccount.currency,
        isDefault: invoice.bankAccount.isDefault,
      }
    : null;

  const formData: InvoiceFormData = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    senderProfileId: invoice.senderProfileId,
    bankAccountId: invoice.bankAccountId || '',
    customerId: invoice.customerId,
    issueDate: new Date(invoice.issueDate),
    dueDate: new Date(invoice.dueDate),
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
): Promise<Blob> {
  const data = invoiceData ?? prepareInvoiceDataForPdf(invoice);

  let logoBase64: string | null = null;
  if (data.senderProfile?.logo) {
    logoBase64 = await convertLogoToBase64(data.senderProfile.logo);
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
      logoBase64={logoBase64}
    />
  );

  return await pdf(doc).toBlob();
}

/**
 * Downloads invoice as PDF
 */
export async function downloadInvoicePdf(
  invoice: SerializedInvoice,
  invoiceData?: InvoicePdfData
): Promise<boolean> {
  try {
    const blob = await generateInvoicePdfBlob(invoice, invoiceData);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoice.invoiceNumber}(${siteConfig.branding.domain}).pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    toast.success('PDF downloaded successfully');
    return true;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    toast.error('Failed to download PDF');
    return false;
  }
}

/**
 * Opens invoice PDF in new window for printing
 */
export async function printInvoicePdf(
  invoice: SerializedInvoice,
  invoiceData?: InvoicePdfData
): Promise<boolean> {
  try {
    const blob = await generateInvoicePdfBlob(invoice, invoiceData);
    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url);
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
        URL.revokeObjectURL(url);
      });
    }
    return true;
  } catch (error) {
    console.error('Error printing PDF:', error);
    toast.error('Failed to print PDF');
    return false;
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
): Promise<Blob> {
  let logoBase64: string | null = null;
  if (senderProfile?.logo) {
    logoBase64 = await convertLogoToBase64(senderProfile.logo);
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
      logoBase64={logoBase64}
    />
  );

  return await pdf(doc).toBlob();
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
): Promise<boolean> {
  try {
    const blob = await generatePdfBlobFromFormData(
      formData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${formData.invoiceNumber || 'invoice'}(${siteConfig.branding.domain}).pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('PDF downloaded');
    return true;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    toast.error('Error generating PDF');
    return false;
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
): Promise<boolean> {
  try {
    const blob = await generatePdfBlobFromFormData(
      formData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url);
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
        URL.revokeObjectURL(url);
      });
    }
    return true;
  } catch (error) {
    console.error('Error printing PDF:', error);
    toast.error('Error generating PDF');
    return false;
  }
}
