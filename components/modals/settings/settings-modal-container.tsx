'use client';

import { useModalStore } from '@/store/use-modal-store';
import dynamic from 'next/dynamic';

const ConfirmationModal = dynamic(
  () =>
    import('@/components/modals/confirmation-modal').then(
      (mod) => mod.ConfirmationModal
    ),
  { ssr: false }
);

interface ConfirmationModalData {
  showConfirmationModal?: boolean;
  onConfirm?: () => void;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  confirmText?: string;
  cancelText?: string;
}

function extractConfirmationData(
  data: Record<string, unknown>
): ConfirmationModalData {
  return {
    showConfirmationModal: Boolean(data.showConfirmationModal),
    onConfirm:
      typeof data.onConfirm === 'function'
        ? (data.onConfirm as () => void)
        : undefined,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    variant:
      data.variant === 'destructive' || data.variant === 'default'
        ? data.variant
        : 'default',
    confirmText:
      typeof data.confirmText === 'string' ? data.confirmText : undefined,
    cancelText:
      typeof data.cancelText === 'string' ? data.cancelText : undefined,
  };
}

export function SettingsModalContainer() {
  const { data, resetModalProps } = useModalStore();
  const modalData = extractConfirmationData(data);

  return (
    <>
      {modalData.showConfirmationModal && (
        <ConfirmationModal
          onClose={resetModalProps}
          open={modalData.showConfirmationModal}
          onConfirm={modalData.onConfirm ?? (() => {})}
          title={modalData.title ?? ''}
          description={modalData.description ?? ''}
          variant={modalData.variant ?? 'default'}
          confirmText={modalData.confirmText}
          cancelText={modalData.cancelText}
        />
      )}
    </>
  );
}
