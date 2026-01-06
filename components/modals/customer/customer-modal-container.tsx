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

const CustomPriceModal = dynamic(
  () =>
    import('@/components/modals/customer/custom-price-modal').then(
      (mod) => mod.CustomPriceModal
    ),
  { ssr: false }
);

export function CustomerModalContainer() {
  const confirmationModal = useModal('confirmationModal');
  const customPriceModal = useModal('customPriceModal');

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

      {customPriceModal.isOpen && customPriceModal.props && (
        <CustomPriceModal
          open={customPriceModal.isOpen}
          close={customPriceModal.close}
          onFormSubmit={customPriceModal.props.onFormSubmit}
          defaultValues={customPriceModal.props.defaultValues}
          isEditing={customPriceModal.props.isEditing}
          mode={customPriceModal.props.mode}
          onLoadProducts={customPriceModal.props.onLoadProducts}
          productInfo={customPriceModal.props.productInfo}
        />
      )}
    </>
  );
}
