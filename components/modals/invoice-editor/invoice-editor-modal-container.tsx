'use client';

import { useModal } from '@/store/use-modal-store';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { ValidationErrorDialog } from './validation-error-dialog';

export function InvoiceEditorModalContainer() {
  const unsavedChangesDialog = useModal('unsavedChangesDialog');
  const validationErrorDialog = useModal('validationErrorDialog');

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
    </>
  );
}
