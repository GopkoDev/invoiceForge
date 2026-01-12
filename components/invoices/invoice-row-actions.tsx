'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  FileText,
  Pencil,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { protectedRoutes } from '@/config/routes.config';
import {
  deleteInvoice,
  duplicateInvoice,
  updateInvoiceStatus,
  getInvoice,
} from '@/lib/actions/invoice-actions/invoice-actions';
import { InvoiceStatus } from '@/types/invoice/types';
import { toast } from 'sonner';
import { useModal } from '@/store/use-modal-store';
import {
  downloadInvoicePdf,
  printInvoicePdf,
} from '@/lib/helpers/invoice-pdf-helpers';

interface InvoiceRowActionsProps {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
}

export function InvoiceRowActions({
  invoiceId,
  invoiceNumber,
  status,
}: InvoiceRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const invoicePdfPreviewModal = useModal('invoicePdfPreviewModal');

  const handleView = useCallback(async () => {
    setIsLoadingPdf(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (result.success && result.data) {
        invoicePdfPreviewModal.open({ invoice: result.data });
      } else {
        toast.error(result.error || 'Failed to load invoice');
      }
    } catch {
      toast.error('Failed to load invoice');
    } finally {
      setIsLoadingPdf(false);
    }
  }, [invoiceId, invoicePdfPreviewModal]);

  const handleEdit = () => {
    router.push(protectedRoutes.invoiceEdit(invoiceId));
  };

  const handleDownload = useCallback(async () => {
    setIsLoadingPdf(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to load invoice');
        return;
      }
      await downloadInvoicePdf(result.data);
    } finally {
      setIsLoadingPdf(false);
    }
  }, [invoiceId]);

  const handlePrint = useCallback(async () => {
    setIsLoadingPdf(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to load invoice');
        return;
      }
      await printInvoicePdf(result.data);
    } finally {
      setIsLoadingPdf(false);
    }
  }, [invoiceId]);

  const handleDuplicate = () => {
    startTransition(async () => {
      const result = await duplicateInvoice(invoiceId);
      if (result.success && result.data) {
        toast.success('Invoice duplicated successfully');
        router.push(protectedRoutes.invoiceEdit(result.data.id));
      } else {
        toast.error(result.error || 'Failed to duplicate invoice');
      }
      setOpen(false);
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteInvoice(invoiceId);
      if (result.success) {
        toast.success('Invoice deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete invoice');
      }
      setOpen(false);
    });
  };

  const handleStatusChange = (newStatus: InvoiceStatus) => {
    startTransition(async () => {
      const result = await updateInvoiceStatus(invoiceId, newStatus);
      if (result.success) {
        toast.success(`Invoice marked as ${newStatus.toLowerCase()}`);
      } else {
        toast.error(result.error || 'Failed to update invoice status');
      }
      setOpen(false);
    });
  };

  const canDelete = status === 'DRAFT';
  const canMarkAsPaid = status === 'PENDING' || status === 'OVERDUE';
  const canMarkAsPending = status === 'DRAFT';
  const canMarkAsOverdue = status === 'PENDING';
  const canCancel = status !== 'CANCELLED' && status !== 'PAID';

  const isShowSeparator =
    canMarkAsPending || canMarkAsPaid || canMarkAsOverdue || canCancel;
  const isDisabled = isPending || isLoadingPdf;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={isDisabled}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions for {invoiceNumber}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleView} disabled={isDisabled}>
          <FileText className="size-4" />
          View Document
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload} disabled={isDisabled}>
          <Download className="size-4" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrint} disabled={isDisabled}>
          <Printer className="size-4" />
          Print
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleEdit}>
          <Pencil className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDuplicate} disabled={isDisabled}>
          <Copy className="size-4" />
          Duplicate
        </DropdownMenuItem>

        {isShowSeparator && <DropdownMenuSeparator />}

        {canMarkAsPending && (
          <DropdownMenuItem
            onClick={() => handleStatusChange('PENDING')}
            disabled={isDisabled}
          >
            <Clock className="size-4" />
            Mark as Pending
          </DropdownMenuItem>
        )}
        {canMarkAsPaid && (
          <DropdownMenuItem
            onClick={() => handleStatusChange('PAID')}
            disabled={isDisabled}
          >
            <CheckCircle className="size-4" />
            Mark as Paid
          </DropdownMenuItem>
        )}
        {canMarkAsOverdue && (
          <DropdownMenuItem
            onClick={() => handleStatusChange('OVERDUE')}
            disabled={isDisabled}
          >
            <AlertTriangle className="size-4" />
            Mark as Overdue
          </DropdownMenuItem>
        )}
        {canCancel && (
          <DropdownMenuItem
            onClick={() => handleStatusChange('CANCELLED')}
            disabled={isDisabled}
          >
            <XCircle className="size-4" />
            Cancel Invoice
          </DropdownMenuItem>
        )}

        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={handleDelete}
              disabled={isDisabled}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
