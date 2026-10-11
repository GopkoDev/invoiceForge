'use client';

import { useState, useCallback, useMemo } from 'react';
import { X, Download, Printer, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useModal } from '@/store/use-modal-store';
import { PDFPreviewPanel } from '@/components/invoice-editor/pdf-preview-panel';
import { prepareInvoiceDataForPdf } from '@/lib/helpers/invoice-pdf-helpers';
import type { InvoiceDocumentSource } from '@/lib/invoice-document';
import { usePdfAction } from '@/hooks/use-pdf-action';
import { PdfPreparingStatus } from '@/components/invoices/pdf-preparing-status';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import type { SerializedInvoice } from '@/types/invoice/types';

export interface InvoicePdfPreviewModalProps {
  invoice: SerializedInvoice;
}

export function InvoicePdfPreviewModal() {
  const { isOpen, props, close } = useModal('invoicePdfPreviewModal');
  const invoice = props?.invoice;

  const { run: runPdf } = usePdfAction();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const invoiceData = useMemo(
    () => (invoice ? prepareInvoiceDataForPdf(invoice) : null),
    [invoice]
  );

  const previewSource = useMemo<InvoiceDocumentSource | null>(
    () => (invoice ? { kind: 'issued', invoice } : null),
    [invoice]
  );

  const handleDownload = useCallback(async () => {
    if (!invoice || !invoiceData) return;

    setIsDownloading(true);
    try {
      const result = await runPdf('download', invoice);
      if (result.unauthorized) goToSignIn();
    } finally {
      setIsDownloading(false);
    }
  }, [invoice, invoiceData, runPdf]);

  const handlePrint = useCallback(async () => {
    if (!invoice || !invoiceData) return;

    setIsPrinting(true);
    try {
      const result = await runPdf('print', invoice);
      if (result.unauthorized) goToSignIn();
    } finally {
      setIsPrinting(false);
    }
  }, [invoice, invoiceData, runPdf]);

  if (!isOpen || !invoice || !invoiceData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="flex h-dvh max-h-dvh w-screen max-w-none! flex-col gap-0 p-0 sm:h-[90dvh] sm:max-h-[90dvh] sm:w-full sm:sm:max-w-212.5!"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b px-3 pt-3 pb-2 sm:px-6 sm:pt-6 sm:pb-4">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="truncate text-base font-semibold sm:text-lg">
              {invoice.invoiceNumber} - Document Preview
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={isPrinting}
                aria-busy={isPrinting || undefined}
                className="gap-1 sm:gap-2"
              >
                {isPrinting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
                <span className="sr-only sm:not-sr-only">Print</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={isDownloading}
                aria-busy={isDownloading || undefined}
                className="gap-1 sm:gap-2"
              >
                {isDownloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                <span className="sr-only sm:not-sr-only">Download</span>
              </Button>
              <PdfPreparingStatus busy={isPrinting || isDownloading} />
              <DialogClose render={<Button variant="ghost" size="icon-sm" />}>
                <X className="size-4" />
                <span className="sr-only">Close preview</span>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        {/* PDF Preview */}
        <div className="min-h-0 flex-1">
          {previewSource && (
            <PDFPreviewPanel
              source={previewSource}
              senderProfile={invoiceData?.senderProfile ?? undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
