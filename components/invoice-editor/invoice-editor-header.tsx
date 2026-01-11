'use client';

import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { invoiceStatusConfig } from '@/types/invoice/types';
import { useInvoicePdf } from '@/hooks/use-invoice-pdf';
import { MoreVertical } from 'lucide-react';
import {
  useInvoiceNumber,
  useInvoiceStatus,
  useHasUnsavedChanges,
  useInvoiceId,
} from '@/store/invoice-editor-store';
import { EditorSaveStatus } from './invoice-editor-save-status';
import { useEditorHeaderButtons } from '@/hooks/use-editor-header-buttons';

export function InvoiceEditorHeader() {
  const invoiceNumber = useInvoiceNumber();
  const status = useInvoiceStatus();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const invoiceId = useInvoiceId();

  const { HomeButton, HomeMobileButton, SaveButton, SaveMobileButton } =
    useEditorHeaderButtons();
  const {
    DownloadButton,
    DownloadMobileButton,
    PrintButton,
    PrintMobileButton,
  } = useInvoicePdf();

  const statusInfo = invoiceStatusConfig[status];
  const isSaved = !hasUnsavedChanges;
  const isNew = !invoiceId;

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const InvoiceName = (
    <h1 className="truncate text-base font-semibold md:text-lg">
      {invoiceNumber || 'Untitled Invoice'}
    </h1>
  );

  const InvoiceStatus = (
    <Badge variant={statusInfo.variant} className="shrink-0">
      {statusInfo.label}
    </Badge>
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
          {DownloadButton}
          {PrintButton}
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-2 md:hidden">
          {SaveMobileButton}

          <DropdownMenu>
            <DropdownMenuTrigger className="hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 inline-flex h-9 w-9 items-center justify-center rounded-md">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              {DownloadMobileButton}
              {PrintMobileButton}
              {HomeMobileButton}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
