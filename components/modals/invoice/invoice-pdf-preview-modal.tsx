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
import {
  prepareInvoiceDataForPdf,
  downloadInvoicePdf,
  printInvoicePdf,
} from '@/lib/helpers/invoice-pdf-helpers';
import type { SerializedInvoice } from '@/types/invoice/types';

export interface InvoicePdfPreviewModalProps {
  invoice: SerializedInvoice;
}

export function InvoicePdfPreviewModal() {
  const { isOpen, props, close } = useModal('invoicePdfPreviewModal');
  const invoice = props?.invoice;

  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const invoiceData = useMemo(
    () => (invoice ? prepareInvoiceDataForPdf(invoice) : null),
    [invoice]
  );

  const handleDownload = useCallback(async () => {
    if (!invoice || !invoiceData) return;

    setIsDownloading(true);
    try {
      await downloadInvoicePdf(invoice, invoiceData);
    } finally {
      setIsDownloading(false);
    }
  }, [invoice, invoiceData]);

  const handlePrint = useCallback(async () => {
    if (!invoice || !invoiceData) return;

    setIsPrinting(true);
    try {
      await printInvoicePdf(invoice, invoiceData);
    } finally {
      setIsPrinting(false);
    }
  }, [invoice, invoiceData]);

  if (!isOpen || !invoice || !invoiceData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-[100vw] !max-w-none flex-col gap-0 p-0 sm:h-[90vh] sm:max-h-[90vh] sm:w-full sm:!max-w-[850px]"
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
                className="gap-1 sm:gap-2"
              >
                {isPrinting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
                <span className="hidden sm:inline">Print</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={isDownloading}
                className="gap-1 sm:gap-2"
              >
                {isDownloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                <span className="hidden sm:inline">Download</span>
              </Button>
              <DialogClose render={<Button variant="ghost" size="icon-sm" />}>
                <X className="size-4" />
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        {/* PDF Preview */}
        <div className="min-h-0 flex-1">
          <PDFPreviewPanel
            formData={invoiceData.formData}
            senderProfile={invoiceData.senderProfile ?? undefined}
            customer={invoiceData.customer ?? undefined}
            bankAccount={invoiceData.bankAccount ?? undefined}
            subtotal={invoice.subtotal}
            taxAmount={invoice.taxAmount}
            total={invoice.total}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
