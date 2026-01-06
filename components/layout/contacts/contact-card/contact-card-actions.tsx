'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Eye, Trash2 } from 'lucide-react';
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

  const handleDelete = async () => {
    confirmationModal.open({
      open: true,
      title: `Delete ${entityLabel}`,
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setIsDeleting(true);
        const result = await deleteAction(id);

        if (result.success) {
          toast.success(`${entityLabel} deleted successfully`);
          router.refresh();
        } else {
          toast.error(
            result.error || `Failed to delete ${entityLabel.toLowerCase()}`
          );
        }
        setIsDeleting(false);
      },
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
