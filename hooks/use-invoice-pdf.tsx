import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import { useFormData, useSummary, useHasUnsavedChanges, usePdfParties } from '@/store/invoice-editor-store';
import {
  downloadPdfFromFormData,
  printPdfFromFormData,
} from '@/lib/helpers/invoice-pdf-helpers';

export function useInvoicePdf() {
  // The form as it stands, every line included (lines are never dropped, invoice-integrity AC-15).
  const pdfFormData = useFormData();
  const { senderProfile, customer, bankAccount } = usePdfParties();
  const { subtotal, taxAmount, total } = useSummary();
  const hasUnsavedChanges = useHasUnsavedChanges();

  const handleDownloadPdf = useCallback(async () => {
    if (hasUnsavedChanges) return;

    const result = await downloadPdfFromFormData(
      pdfFormData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
    if (result.unauthorized) goToSignIn();
  }, [
    pdfFormData,
    senderProfile,
    customer,
    bankAccount,
    subtotal,
    taxAmount,
    total,
    hasUnsavedChanges,
  ]);

  const handlePrint = useCallback(async () => {
    if (hasUnsavedChanges) return;

    const result = await printPdfFromFormData(
      pdfFormData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
    if (result.unauthorized) goToSignIn();
  }, [
    pdfFormData,
    senderProfile,
    customer,
    bankAccount,
    subtotal,
    taxAmount,
    total,
    hasUnsavedChanges,
  ]);

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
