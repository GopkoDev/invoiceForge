'use client';

import { useModal } from '@/store/use-modal-store';
import dynamic from 'next/dynamic';

const ConfirmationModal = dynamic(
  () =>
    import(
      '@/components/modals/global-modals/confirmation-modal/confirmation-modal'
    ).then((mod) => mod.ConfirmationModal),
  { ssr: false }
);

export function CustomerModalContainer() {
  const confirmationModal = useModal('confirmationModal');

  return (
    <>
      {confirmationModal.isOpen && confirmationModal.props && (
        <ConfirmationModal
          open={confirmationModal.isOpen}
          onClose={confirmationModal.close}
          onConfirm={confirmationModal.props.onConfirm}
          title={confirmationModal.props.title}
          description={confirmationModal.props.description}
          variant={confirmationModal.props.variant}
          confirmText={confirmationModal.props.confirmText}
          cancelText={confirmationModal.props.cancelText}
        />
      )}
    </>
  );
}
