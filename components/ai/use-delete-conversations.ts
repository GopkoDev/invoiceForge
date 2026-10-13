'use client';

import { toast } from 'sonner';
import { deleteAllConversations, deleteConversation } from '@/lib/actions/assistant-actions';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import { useModal } from '@/store/use-modal-store';
import type { ActionResult } from '@/types/result';

export type DeletedTarget = { kind: 'one'; id: string } | { kind: 'all' };

interface DeleteHandlers {
  /** Runs after the Conversation is gone (deleted now, or already gone): refresh the list or leave the page. */
  onGone: (target: DeletedTarget) => void;
}

/** SCR-04: opens the delete dialog for one Conversation or for all of them. */
export function useDeleteConversations({ onGone }: DeleteHandlers) {
  const confirmationModal = useModal('confirmationModal');

  const confirm = (
    target: DeletedTarget,
    copy: { title: string; description: string; confirmText: string; success: string },
    run: () => Promise<ActionResult<unknown>>
  ) => {
    confirmationModal.open({
      open: true,
      onClose: confirmationModal.close,
      title: copy.title,
      description: copy.description,
      confirmText: copy.confirmText,
      variant: 'destructive',
      onConfirm: async () => {
        const result = await run();
        if (result.success) {
          confirmationModal.close();
          toast.success(copy.success);
          onGone(target);
          return;
        }
        if (result.code === 'UNAUTHORIZED') {
          goToSignIn();
          return;
        }
        if (result.code === 'NOT_FOUND') {
          confirmationModal.close();
          toast.error(result.error);
          onGone(target);
          return;
        }
        confirmationModal.close();
        toast.error(result.error);
      },
    });
  };

  const deleteOne = (id: string, title: string) =>
    confirm(
      { kind: 'one', id },
      {
        title: 'Delete this conversation?',
        description: `“${title}” will be deleted for good. Drafts it created stay in your invoices.`,
        confirmText: 'Delete',
        success: 'Conversation deleted.',
      },
      () => deleteConversation(id)
    );

  const deleteAll = (total: number) =>
    confirm(
      { kind: 'all' },
      {
        title: 'Delete all conversations?',
        description: `All ${total} conversations will be deleted for good. Drafts they created stay in your invoices.`,
        confirmText: 'Delete all',
        success: 'All conversations deleted.',
      },
      () => deleteAllConversations()
    );

  return { deleteOne, deleteAll };
}
