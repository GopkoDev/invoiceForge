import { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import { useFormData, useSummary, useHasUnsavedChanges, usePdfParties } from '@/store/invoice-editor-store';
import { usePdfAction, type PdfAction } from '@/hooks/use-pdf-action';
import { loadPdfKit } from '@/lib/pdf/load-pdf-kit';

export function useInvoicePdf() {
  // The form as it stands, every line included (lines are never dropped, invoice-integrity AC-15).
  const pdfFormData = useFormData();
  const { senderProfile, customer, bankAccount } = usePdfParties();
  const { subtotal, taxAmount, total } = useSummary();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const { runInput } = usePdfAction();

  // The editor's preview is HTML, so the toolkit is only warmed once the page is idle; a failed
  // warm-up is silent (Download/Print fetch it again).
  useEffect(() => {
    const warm = () => void loadPdfKit().catch(() => undefined);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 2000);
    return () => clearTimeout(id);
  }, []);

  const runAction = useCallback(
    async (action: PdfAction) => {
      if (hasUnsavedChanges) return;
      const result = await runInput(action, {
        formData: pdfFormData,
        senderProfile,
        customer,
        bankAccount,
        subtotal,
        taxAmount,
        total,
      });
      if (result.unauthorized) goToSignIn();
    },
    [pdfFormData, senderProfile, customer, bankAccount, subtotal, taxAmount, total, hasUnsavedChanges, runInput]
  );

  const handleDownloadPdf = useCallback(() => runAction('download'), [runAction]);
  const handlePrint = useCallback(() => runAction('print'), [runAction]);

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
