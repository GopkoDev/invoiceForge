'use client';

import { useState, useTransition, useCallback } from 'react';
import type { ActionFailure } from '@/types/result';
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
import {
  goToSignIn,
  redirectIfUnauthorized,
} from '@/lib/helpers/client-session-redirect';
import { allowedTargets } from '@/lib/helpers/invoice-status';
import { todayInZone } from '@/lib/helpers/calendar-day';

interface InvoiceRowActionsProps {
  invoiceId: string;
  invoiceNumber: string;
  /** The row's status as the list shows it (an overdue-by-date pending row reads OVERDUE). */
  status: InvoiceStatus;
  /** The stored status: the menu's moves come from it, not from the derived one (defaults to `status`). */
  storedStatus?: InvoiceStatus;
  /** The stored due date: gates overdue → pending (not past due in the Freelancer's zone). */
  dueDate?: Date | string;
  /** The Freelancer's time zone, for "today". */
  timeZone?: string;
  onDataChange?: () => void;
}

/** The status a refused action reports the invoice is really in (STATUS_NOT_ALLOWED). */
function refusedAt(result: ActionFailure): InvoiceStatus | null {
  return result.details?.kind === 'STATUS_NOT_ALLOWED' ? result.details.currentStatus : null;
}

export function InvoiceRowActions({
  invoiceId,
  invoiceNumber,
  status,
  storedStatus,
  dueDate,
  timeZone,
  onDataChange,
}: InvoiceRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  // invoice-integrity T15 (SCR-01 status-refused): a refusal names the invoice's current status;
  // the menu is redrawn at it until the refreshed row arrives.
  const [refusedStatus, setRefusedStatus] = useState<{ from: InvoiceStatus; to: InvoiceStatus } | null>(null);
  const menuStatus = storedStatus ?? status;
  const rowStatus = refusedStatus && refusedStatus.from === menuStatus ? refusedStatus.to : menuStatus;
  const invoicePdfPreviewModal = useModal('invoicePdfPreviewModal');
  const confirmationModal = useModal('confirmationModal');

  const handleView = useCallback(async () => {
    setIsLoadingPdf(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (result.success) {
        invoicePdfPreviewModal.open({ invoice: result.data });
      } else if (!redirectIfUnauthorized(result)) {
        toast.error(result.error || 'Failed to load invoice');
      }
    } catch {
      // AC-21: a rejected call is treated like UNAUTHORIZED.
      goToSignIn();
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
      if (!result.success) {
        // AC-21: a stale session must go to sign-in, not a generic "failed to load" toast.
        if (redirectIfUnauthorized(result)) return;
        toast.error(result.error || 'Failed to load invoice');
        return;
      }
      const pdf = await downloadInvoicePdf(result.data);
      // N-05: a 401 on the logo fetch is reported as a result, not thrown.
      if (pdf.unauthorized) goToSignIn();
    } catch {
      // AC-21: a rejected call is treated like UNAUTHORIZED.
      goToSignIn();
    } finally {
      setIsLoadingPdf(false);
    }
  }, [invoiceId]);

  const handlePrint = useCallback(async () => {
    setIsLoadingPdf(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (!result.success) {
        // AC-21: a stale session must go to sign-in, not a generic "failed to load" toast.
        if (redirectIfUnauthorized(result)) return;
        toast.error(result.error || 'Failed to load invoice');
        return;
      }
      const pdf = await printInvoicePdf(result.data);
      // N-05: a 401 on the logo fetch is reported as a result, not thrown.
      if (pdf.unauthorized) goToSignIn();
    } catch {
      // AC-21: a rejected call is treated like UNAUTHORIZED.
      goToSignIn();
    } finally {
      setIsLoadingPdf(false);
    }
  }, [invoiceId]);

  const handleDuplicate = () => {
    startTransition(async () => {
      try {
        const result = await duplicateInvoice(invoiceId);
        if (result.success) {
          // SCR-02 "duplicated" (AC-12, F-14): name the new invoice number and stay on the list;
          // the copy shows up in the refreshed list rather than opening in the editor.
          toast.success(`Duplicated as ${result.data.invoiceNumber}`);
          onDataChange?.();
          router.refresh();
        } else if (!redirectIfUnauthorized(result)) {
          toast.error(result.error || 'Failed to duplicate invoice');
        }
      } catch {
        // AC-21: a rejected call must not reach the error boundary; treat it like UNAUTHORIZED.
        goToSignIn();
      } finally {
        setOpen(false);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteInvoice(invoiceId);
        if (result.success) {
          toast.success('Invoice deleted successfully');
          onDataChange?.();
          router.refresh();
        } else if (!redirectIfUnauthorized(result)) {
          toast.error(result.error || 'Failed to delete invoice');
          redrawAfterRefusal(result);
        }
      } catch {
        // AC-21: a rejected call must not reach the error boundary; treat it like UNAUTHORIZED.
        goToSignIn();
      } finally {
        setOpen(false);
      }
    });
  };

  /** SCR-01 status-refused / delete-refused: redraw the row at the status the server reports. */
  const redrawAfterRefusal = (result: ActionFailure) => {
    const current = refusedAt(result);
    if (current) setRefusedStatus({ from: menuStatus, to: current });
    if (result.code === 'VALIDATION') {
      onDataChange?.();
      router.refresh();
    }
  };

  const reportStatusResult = (
    newStatus: InvoiceStatus,
    result: Awaited<ReturnType<typeof updateInvoiceStatus>>
  ) => {
    if (result.success) {
      toast.success(`Invoice marked as ${newStatus.toLowerCase()}`);
      onDataChange?.();
      router.refresh();
    } else if (!redirectIfUnauthorized(result)) {
      // The server's explanation verbatim (a lifecycle refusal or the draft rules on issue).
      toast.error(result.error || 'Failed to update invoice status');
      redrawAfterRefusal(result);
    }
  };

  const handleStatusChange = (newStatus: InvoiceStatus) => {
    startTransition(async () => {
      try {
        reportStatusResult(newStatus, await updateInvoiceStatus(invoiceId, newStatus));
      } catch {
        // AC-21: a rejected call must not reach the error boundary; treat it like UNAUTHORIZED.
        goToSignIn();
      } finally {
        setOpen(false);
      }
    });
  };

  // SCR-04: cancelling is final, so it is confirmed first; the dialog is closed by us on every result.
  const handleCancel = () => {
    setOpen(false);
    confirmationModal.open({
      open: true,
      onClose: confirmationModal.close,
      title: `Cancel invoice ${invoiceNumber}?`,
      description:
        "A cancelled invoice is final. It stays in your list and can still be viewed, downloaded, printed and duplicated, but it can't be changed or deleted.",
      variant: 'destructive',
      confirmText: 'Cancel invoice',
      cancelText: 'Keep invoice',
      onConfirm: async () => {
        try {
          const result = await updateInvoiceStatus(invoiceId, 'CANCELLED');
          confirmationModal.close();
          reportStatusResult('CANCELLED', result);
        } catch {
          confirmationModal.close();
          goToSignIn();
        }
      },
    });
  };

  // The moves come from the shared transition table (ADR-0002); no status rule lives here. Without
  // a due date, an overdue row is treated as past due (Mark as Pending is not offered).
  const today = todayInZone(timeZone);
  const targets = allowedTargets(rowStatus, dueDate ? new Date(dueDate) : new Date(0), today);
  const canMarkAsPending = targets.includes('PENDING');
  const canMarkAsPaid = targets.includes('PAID');
  const canMarkAsOverdue = targets.includes('OVERDUE');
  const canCancel = targets.includes('CANCELLED');
  const canDelete = rowStatus === 'DRAFT';
  const canEdit = rowStatus !== 'CANCELLED';

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

        {canEdit && (
          <DropdownMenuItem onClick={handleEdit}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
        )}
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
          <DropdownMenuItem onClick={handleCancel} disabled={isDisabled}>
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
