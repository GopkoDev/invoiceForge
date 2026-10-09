'use client';

import dynamic from 'next/dynamic';
import { useModal } from '@/store/use-modal-store';
import {
  useChangedElsewhere,
  useInvoiceEditorActions,
  useTotalsChanged,
} from '@/store/invoice-editor-store';
import { useInvoiceReload } from '@/hooks/use-invoice-reload';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { ValidationErrorDialog } from './validation-error-dialog';

// SCR-09 / SCR-10 are the shared ConfirmationModal, rendered here from the editor store's
// totalsChanged / changedElsewhere state (editor-ux T14, ADR-0005) so a save started anywhere —
// the header or a toast's Retry — reaches them. Must be mounted inside <InvoiceEditorProvider>.
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
  const totalsChanged = useTotalsChanged();
  const changedElsewhere = useChangedElsewhere();
  const { save, clearTotalsChanged, markStale } = useInvoiceEditorActions();
  const reload = useInvoiceReload();

  return (
    <>
      {/* invoice-integrity T18 (SCR-05 / SCR-10): the invoice changed after this editor loaded it.
          Reload re-initialises from the current invoice; Close (or Esc) leaves the editor stale,
          edits kept. */}
      {changedElsewhere && (
        <ConfirmationModal
          open
          title="This invoice changed elsewhere"
          description={changedElsewhere}
          body={<p className="text-muted-foreground text-sm">Reloading discards your unsaved changes.</p>}
          confirmText="Reload invoice"
          cancelText="Close"
          onClose={markStale}
          onConfirm={async () => {
            await reload();
          }}
        />
      )}

      {/* SCR-09: confirm the new total. Confirm resubmits with the shown figures (and re-opens with
          fresh ones if the server answers again); Cancel clears the state and sends nothing. */}
      {!changedElsewhere && totalsChanged && (
        <ConfirmationModal
          open
          title="Confirm the new total"
          description="This invoice was saved before totals were recalculated."
          body={
            <dl className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Old total</dt>
                <dd>{totalsChanged.oldTotal}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">New total</dt>
                <dd>{totalsChanged.newTotal}</dd>
              </div>
            </dl>
          }
          confirmText="Confirm and save"
          onClose={clearTotalsChanged}
          onConfirm={async () => {
            await save('save', { confirmedTotals: totalsChanged });
          }}
        />
      )}

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
