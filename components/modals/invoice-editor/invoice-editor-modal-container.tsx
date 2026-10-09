'use client';

import dynamic from 'next/dynamic';
import { useModal } from '@/store/use-modal-store';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { ValidationErrorDialog } from './validation-error-dialog';

// SCR-15's dialog is the shared, T15-extended ConfirmationModal (sad.md §4 "modals go through
// store/use-modal-store.ts"); use-editor-header-buttons.tsx opens it on CONFLICT TOTALS_CHANGED.
const ConfirmationModal = dynamic(
  () =>
    import('@/components/modals/global-modals/confirmation-modal/confirmation-modal').then(
      (mod) => mod.ConfirmationModal
    ),
  { ssr: false }
);

export function InvoiceEditorModalContainer() {
  const unsavedChangesDialog = useModal('unsavedChangesDialog');
  const validationErrorDialog = useModal('validationErrorDialog');
  const confirmationModal = useModal('confirmationModal');

  return (
    <>
      {unsavedChangesDialog.isOpen && unsavedChangesDialog.props && (
        <UnsavedChangesDialog
          open={unsavedChangesDialog.isOpen}
          onSave={unsavedChangesDialog.props.onSave}
          onDiscard={unsavedChangesDialog.props.onDiscard}
          onCancel={unsavedChangesDialog.props.onCancel}
        />
      )}

      {validationErrorDialog.isOpen && validationErrorDialog.props && (
        <ValidationErrorDialog
          open={validationErrorDialog.isOpen}
          errors={validationErrorDialog.props.errors}
          onClose={validationErrorDialog.props.onClose}
        />
      )}

      {confirmationModal.isOpen && confirmationModal.props && (
        <ConfirmationModal
          open={confirmationModal.isOpen}
          // F-47: use the dialog's own onClose (e.g. openTotalsConfirmation's onClose, which
          // clears totalsChanged before closing) instead of always jumping straight to
          // confirmationModal.close, which skipped that cleanup entirely.
          onClose={confirmationModal.props.onClose ?? confirmationModal.close}
          onConfirm={confirmationModal.props.onConfirm}
          title={confirmationModal.props.title}
          description={confirmationModal.props.description}
          body={confirmationModal.props.body}
          variant={confirmationModal.props.variant}
          confirmText={confirmationModal.props.confirmText}
          cancelText={confirmationModal.props.cancelText}
          confirmDisabled={confirmationModal.props.confirmDisabled}
          hideConfirm={confirmationModal.props.hideConfirm}
        />
      )}
    </>
  );
}
