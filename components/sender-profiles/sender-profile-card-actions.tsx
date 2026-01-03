'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteSenderProfile } from '@/lib/actions/sender-profile-actions';
import { useModal } from '@/store/use-modal-store';
import { protectedRoutes } from '@/config/routes.config';

interface SenderProfileCardActionsProps {
  profileId: string;
  profileName: string;
}

export function SenderProfileCardActions({
  profileId,
  profileName,
}: SenderProfileCardActionsProps) {
  const router = useRouter();
  const confirmationModal = useModal('confirmationModal');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    confirmationModal.open({
      open: true,
      title: 'Delete Sender Profile',
      description: `Are you sure you want to delete "${profileName}"? This action cannot be undone.`,
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setIsDeleting(true);
        const result = await deleteSenderProfile(profileId);

        if (result.success) {
          toast.success('Sender profile deleted successfully');
          router.refresh();
        } else {
          toast.error(result.error || 'Failed to delete sender profile');
        }
        setIsDeleting(false);
      },
      onClose: confirmationModal.close,
    });
  };

  return (
    <div className="flex gap-2">
      <Link
        href={protectedRoutes.senderProfileEdit(profileId)}
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className: 'flex-1',
        })}
      >
        <Pencil className="h-3 w-3" />
        Edit
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
