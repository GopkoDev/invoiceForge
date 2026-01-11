'use client';

import { useModal } from '@/store/use-modal-store';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { ValidationErrorDialog } from './validation-error-dialog';
import { InvalidItemsWarningDialog } from './invalid-items-warning-dialog';

export function InvoiceEditorModalContainer() {
  const unsavedChangesDialog = useModal('unsavedChangesDialog');
  const validationErrorDialog = useModal('validationErrorDialog');
  const invalidItemsWarningDialog = useModal('invalidItemsWarningDialog');

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

      {invalidItemsWarningDialog.isOpen && invalidItemsWarningDialog.props && (
        <InvalidItemsWarningDialog
          open={invalidItemsWarningDialog.isOpen}
          invalidItems={invalidItemsWarningDialog.props.invalidItems}
          onConfirm={invalidItemsWarningDialog.props.onConfirm}
          onCancel={invalidItemsWarningDialog.props.onCancel}
        />
      )}
    </>
  );
}
