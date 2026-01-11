import { useCallback, useMemo } from 'react';
import { pdf } from '@react-pdf/renderer';
import { toast } from 'sonner';
import { InvoicePDFDocument } from '@/components/invoice-editor/invoice-pdf-document';
import { convertLogoToBase64 } from '@/lib/utils/image-to-base64';
import {
  useFormData,
  useSelectedSenderProfile,
  useSelectedCustomer,
  useSelectedBankAccount,
  useSummary,
  useInvalidItems,
  useHasUnsavedChanges,
} from '@/store/invoice-editor-store';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { siteConfig } from '@/config/site.config';

export function useInvoicePdf() {
  const formData = useFormData();
  const senderProfile = useSelectedSenderProfile();
  const customer = useSelectedCustomer();
  const bankAccount = useSelectedBankAccount();
  const { subtotal, taxAmount, total } = useSummary();
  const invalidItems = useInvalidItems();
  const hasUnsavedChanges = useHasUnsavedChanges();

  const pdfFormData = useMemo(() => {
    const invalidItemIds = new Set(invalidItems.map((inv) => inv.item.id));
    return {
      ...formData,
      items: formData.items.filter((item) => !invalidItemIds.has(item.id)),
    };
  }, [formData, invalidItems]);

  const prepareLogoForPdf = useCallback(async (): Promise<string | null> => {
    if (!senderProfile?.logo) return null;
    return await convertLogoToBase64(senderProfile.logo);
  }, [senderProfile]);

  const generatePdfBlob = useCallback(async (): Promise<Blob> => {
    const logoBase64 = await prepareLogoForPdf();

    const doc = (
      <InvoicePDFDocument
        formData={pdfFormData}
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
  }, [
    pdfFormData,
    senderProfile,
    customer,
    bankAccount,
    subtotal,
    taxAmount,
    total,
    prepareLogoForPdf,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (hasUnsavedChanges) return;

    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${formData.invoiceNumber || 'invoice'}(${siteConfig.branding.domain}).pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success('PDF downloaded');
    } catch (err) {
      console.error(err);
      toast.error('Error generating PDF');
    }
  }, [generatePdfBlob, formData.invoiceNumber, hasUnsavedChanges]);

  const handlePrint = useCallback(async () => {
    if (hasUnsavedChanges) return;

    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);

      const printWindow = window.open(url);
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.focus();
          printWindow.print();
          URL.revokeObjectURL(url);
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error generating PDF');
    }
  }, [generatePdfBlob, hasUnsavedChanges]);

  const DownloadButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadPdf}
      disabled={hasUnsavedChanges}
    >
      <Download className="h-4 w-4" />
      Download PDF
    </Button>
  );

  const DownloadMobileButton = (
    <DropdownMenuItem onClick={handleDownloadPdf} disabled={hasUnsavedChanges}>
      <Download className="mr-2 h-4 w-4" />
      Download PDF
    </DropdownMenuItem>
  );

  const PrintButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePrint}
      disabled={hasUnsavedChanges}
    >
      <Printer className="h-4 w-4" />
      Print
    </Button>
  );

  const PrintMobileButton = (
    <DropdownMenuItem onClick={handlePrint} disabled={hasUnsavedChanges}>
      <Printer className="mr-2 h-4 w-4" />
      Print
    </DropdownMenuItem>
  );

  return {
    DownloadButton,
    DownloadMobileButton,
    PrintButton,
    PrintMobileButton,
  };
}
