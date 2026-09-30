'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertCircle, Eye, Trash2 } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { useModal } from '@/store/use-modal-store';
import { ActionResult } from '@/types/actions';
import {
  goToSignIn,
  redirectIfUnauthorized,
} from '@/lib/helpers/client-session-redirect';

interface ContactCardActionsProps {
  id: string;
  name: string;
  detailRoute: string;
  deleteAction: (id: string) => Promise<ActionResult>;
  entityLabel: string;
  // T35 (SCR-09/SCR-19, F-16): the detail page already shows the record, so it hides the
  // Preview link and labels the icon-only trigger "Delete".
  showPreview?: boolean;
  // T35 (SCR-14, F-16): from a detail page, deletion goes to the record's list instead of
  // refreshing in place. Defaults to the existing list-row behaviour.
  onDeleted?: () => void;
}

export function ContactCardActions({
  id,
  name,
  detailRoute,
  deleteAction,
  entityLabel,
  showPreview = true,
  onDeleted,
}: ContactCardActionsProps) {
  const router = useRouter();
  const confirmationModal = useModal('confirmationModal');
  const [isDeleting, setIsDeleting] = useState(false);

  const title = `Delete ${entityLabel}`;
  const description = `Are you sure you want to delete "${name}"? This action cannot be undone.`;

  const handleConfirm = async () => {
    setIsDeleting(true);
    let result: ActionResult;
    try {
      result = await deleteAction(id);
    } catch {
      // AC-21: a rejected call is treated like UNAUTHORIZED.
      goToSignIn();
      return;
    } finally {
      setIsDeleting(false);
    }

    if (result.success) {
      confirmationModal.close();
      toast.success(`${entityLabel} deleted successfully`);
      if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
      return;
    }

    // AC-21: a stale session's delete must send the device to sign-in, not just toast a
    // generic error and leave the confirmation dialog sitting open.
    if (redirectIfUnauthorized(result)) {
      return;
    }

    if (result.code === 'CONFLICT' && result.details?.kind === 'HAS_INVOICES') {
      // SCR-14 blocked state (AC-22): destructive Alert with the count, only "Close" remains.
      confirmationModal.open({
        open: true,
        title,
        description,
        body: (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{result.error}</AlertTitle>
          </Alert>
        ),
        variant: 'destructive',
        confirmText: 'Delete',
        // F-44: only "Close" remains once Confirm is hidden — the leftover default "Cancel"
        // text belongs to the still-open, not-yet-blocked default dialog.
        cancelText: 'Close',
        hideConfirm: true,
        onConfirm: handleConfirm,
        onClose: confirmationModal.close,
      });
      return;
    }

    // NOT_FOUND (already gone in another tab) and FAILED both close and toast per SCR-14; a
    // NOT_FOUND record is stale, so the list also refreshes.
    confirmationModal.close();
    toast.error(result.error || `Failed to delete ${entityLabel.toLowerCase()}`);
    if (result.code === 'NOT_FOUND') {
      router.refresh();
    }
  };

  const handleDelete = () => {
    confirmationModal.open({
      open: true,
      title,
      description,
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: handleConfirm,
      onClose: confirmationModal.close,
    });
  };

  return (
    <div className="flex gap-2">
      {showPreview && (
        <Link href={detailRoute} className="flex-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isDeleting}
            className="w-full"
          >
            <Eye className="h-3 w-3" />
            Preview
          </Button>
        </Link>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        <Trash2 className="h-3 w-3" />
        {!showPreview && 'Delete'}
      </Button>
    </div>
  );
}
