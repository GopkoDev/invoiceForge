import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  useFormData,
  useSelectedSenderProfile,
  useSelectedCustomer,
  useSelectedBankAccount,
  useSummary,
  useInvalidItems,
  useHasUnsavedChanges,
} from '@/store/invoice-editor-store';
import {
  downloadPdfFromFormData,
  printPdfFromFormData,
} from '@/lib/helpers/invoice-pdf-helpers';

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

  const handleDownloadPdf = useCallback(async () => {
    if (hasUnsavedChanges) return;

    await downloadPdfFromFormData(
      pdfFormData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
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

    await printPdfFromFormData(
      pdfFormData,
      senderProfile,
      customer,
      bankAccount,
      subtotal,
      taxAmount,
      total
    );
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
