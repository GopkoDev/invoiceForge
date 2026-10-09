'use client';

import dynamic from 'next/dynamic';
import { useModal } from '@/store/use-modal-store';

const ConfirmationModal = dynamic(
  () =>
    import('@/components/modals/global-modals/confirmation-modal/confirmation-modal').then(
      (mod) => mod.ConfirmationModal
    ),
  { ssr: false }
);

const InvoicePdfPreviewModal = dynamic(
  () =>
    import('@/components/modals/invoice/invoice-pdf-preview-modal').then(
      (mod) => mod.InvoicePdfPreviewModal
    ),
  { ssr: false }
);

export function InvoiceModalContainer() {
  // SCR-04: the row menu's Cancel Invoice opens the shared confirmation dialog.
  const confirmationModal = useModal('confirmationModal');
  const invoicePdfPreviewModal = useModal('invoicePdfPreviewModal');

  return (
    <>
      {confirmationModal.isOpen && confirmationModal.props && (
        <ConfirmationModal
          open={confirmationModal.isOpen}
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

      {invoicePdfPreviewModal.isOpen && invoicePdfPreviewModal.props && (
        <InvoicePdfPreviewModal />
      )}
    </>
  );
}
