import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import {
  useHasUnsavedChanges,
  useInvoiceEditorStoreApi,
} from '@/store/invoice-editor-store';
import { pdfPartiesOfState } from '@/store/invoice-editor-store/pdf-parties';
import { storedAmountsToPrint } from '@/store/invoice-editor-store/helpers';
import { buildInvoiceDocument } from '@/lib/invoice-document';
import { usePdfAction, type PdfAction } from '@/hooks/use-pdf-action';
import {
  PdfPreparingSpinner,
  PdfPreparingStatus,
} from '@/components/invoices/pdf-preparing-status';
import { loadPdfKit } from '@/lib/pdf/load-pdf-kit';

export function useInvoicePdf() {
  const store = useInvoiceEditorStoreApi();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const { runInput, preparing } = usePdfAction();
  const disabled = hasUnsavedChanges || preparing;
  const [active, setActive] = useState<PdfAction | null>(null);
  const busy = (action: PdfAction) => preparing && active === action;

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
      const state = store.getState();
      if (state.hasUnsavedChanges) return;
      setActive(action);
      // Download and Print are disabled while there are unsaved changes, so whenever they run the form
      // equals the last save and the PDF's model is the preview's (invoice-integrity AC-02). The model
      // is built here, once per click, not on every keystroke.
      const result = await runInput(action, () => {
        const parties = pdfPartiesOfState(state);
        return {
          document: buildInvoiceDocument({
            kind: 'draft',
            form: state.formData,
            parties,
            storedAmounts: storedAmountsToPrint(state),
          }),
          senderProfile: parties.senderProfile,
        };
      });
      if (result.unauthorized) goToSignIn();
    },
    [store, runInput]
  );

  const handleDownloadPdf = useCallback(
    () => runAction('download'),
    [runAction]
  );
  const handlePrint = useCallback(() => runAction('print'), [runAction]);

  const DownloadButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadPdf}
      disabled={disabled}
      aria-busy={busy('download') || undefined}
    >
      {busy('download') ? (
        <PdfPreparingSpinner />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span className="sr-only sm:not-sr-only">Download PDF</span>
    </Button>
  );

  const DownloadMobileButton = (
    <DropdownMenuItem
      onClick={handleDownloadPdf}
      disabled={disabled}
      aria-busy={busy('download') || undefined}
    >
      {busy('download') ? (
        <PdfPreparingSpinner />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      Download PDF
    </DropdownMenuItem>
  );

  const PrintButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePrint}
      disabled={disabled}
      aria-busy={busy('print') || undefined}
    >
      {busy('print') ? (
        <PdfPreparingSpinner />
      ) : (
        <Printer className="h-4 w-4" />
      )}
      <span className="sr-only sm:not-sr-only">Print</span>
    </Button>
  );

  const PrintMobileButton = (
    <DropdownMenuItem
      onClick={handlePrint}
      disabled={disabled}
      aria-busy={busy('print') || undefined}
    >
      {busy('print') ? (
        <PdfPreparingSpinner />
      ) : (
        <Printer className="mr-2 h-4 w-4" />
      )}
      Print
    </DropdownMenuItem>
  );

  // One region for the whole editor: the phone menu closes on select, so the status cannot live in an item.
  const PdfStatus = <PdfPreparingStatus busy={preparing} />;

  return {
    pdfBusy: preparing,
    PdfStatus,
    DownloadButton,
    DownloadMobileButton,
    PrintButton,
    PrintMobileButton,
  };
}
