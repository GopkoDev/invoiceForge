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

const BankAccountModal = dynamic(
  () =>
    import('@/components/modals/sender-profile/bank-account-modal').then(
      (mod) => mod.BankAccountModal
    ),
  { ssr: false }
);

export function SenderProfileModalContainer() {
  const confirmationModal = useModal('confirmationModal');
  const bankAccountModal = useModal('bankAccountModal');

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

      {bankAccountModal.isOpen && bankAccountModal.props && (
        <BankAccountModal
          open={bankAccountModal.isOpen}
          close={bankAccountModal.close}
          senderProfileId={bankAccountModal.props.senderProfileId}
          onFormSubmit={bankAccountModal.props.onFormSubmit}
          defaultValues={bankAccountModal.props.defaultValues}
          isEditing={bankAccountModal.props.isEditing}
        />
      )}
    </>
  );
}
