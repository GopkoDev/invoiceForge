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

interface ContactCardActionsProps {
  id: string;
  name: string;
  detailRoute: string;
  deleteAction: (id: string) => Promise<ActionResult>;
  entityLabel: string;
}

export function ContactCardActions({
  id,
  name,
  detailRoute,
  deleteAction,
  entityLabel,
}: ContactCardActionsProps) {
  const router = useRouter();
  const confirmationModal = useModal('confirmationModal');
  const [isDeleting, setIsDeleting] = useState(false);

  const title = `Delete ${entityLabel}`;
  const description = `Are you sure you want to delete "${name}"? This action cannot be undone.`;

  const handleConfirm = async () => {
    setIsDeleting(true);
    const result = await deleteAction(id);
    setIsDeleting(false);

    if (result.success) {
      confirmationModal.close();
      toast.success(`${entityLabel} deleted successfully`);
      router.refresh();
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

      <Button
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
