'use client';

import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { invoiceStatusConfig } from '@/types/invoice/types';
import { useInvoicePdf } from '@/hooks/use-invoice-pdf';
import { MoreVertical } from 'lucide-react';
import { PdfPreparingSpinner } from '@/components/invoices/pdf-preparing-status';
import {
  useInvoiceNumber,
  useInvoiceStatus,
  useHasUnsavedChanges,
  useInvoiceId,
  useAssistantMark,
} from '@/store/invoice-editor-store';
import { AssistantMark } from '@/components/ai/assistant-mark';
import { EditorSaveStatus } from './invoice-editor-save-status';
import { useEditorHeaderButtons } from '@/hooks/use-editor-header-buttons';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

export function InvoiceEditorHeader() {
  const invoiceNumber = useInvoiceNumber();
  const status = useInvoiceStatus();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const invoiceId = useInvoiceId();
  const assistantMark = useAssistantMark();

  const {
    HomeButton,
    HomeMobileButton,
    SaveButton,
    SaveMobileButton,
    SaveAndIssueButton,
    SaveAndIssueMobileItem,
  } = useEditorHeaderButtons();
  const {
    pdfBusy,
    PdfStatus,
    DownloadButton,
    DownloadMobileButton,
    PrintButton,
    PrintMobileButton,
  } = useInvoicePdf();

  const statusInfo = invoiceStatusConfig[status];
  const isSaved = !hasUnsavedChanges;
  const isNew = !invoiceId;

  useUnsavedChangesGuard(hasUnsavedChanges);

  const InvoiceName = (
    <h1 className="truncate text-base font-semibold md:text-lg">
      {invoiceNumber || 'Untitled Invoice'}
    </h1>
  );

  const InvoiceStatus = (
    <>
      <Badge variant={statusInfo.variant} className="shrink-0">
        {statusInfo.label}
      </Badge>
      {status === 'DRAFT' && <AssistantMark mark={assistantMark} />}
    </>
  );

  return (
    <div className="bg-background border-b">
      <div className="flex items-center justify-between gap-2 px-4 py-3 lg:px-6">
        {/* Left side - Invoice info */}
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          {HomeButton}
          {InvoiceName}
          {InvoiceStatus}
          <EditorSaveStatus isNew={isNew} isSaved={isSaved} />
        </div>

        {/* Right side - Actions */}
        <div className="hidden items-center gap-2 md:flex">
          {SaveButton}
          {SaveAndIssueButton}
          {DownloadButton}
          {PrintButton}
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-2 md:hidden">
          {SaveMobileButton}

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              aria-busy={pdfBusy || undefined}
              className="hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 inline-flex h-9 w-9 items-center justify-center rounded-md"
            >
              {pdfBusy ? (
                <PdfPreparingSpinner />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              {SaveAndIssueMobileItem}
              {DownloadMobileButton}
              {PrintMobileButton}
              {HomeMobileButton}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {PdfStatus}
    </div>
  );
}
