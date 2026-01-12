'use client';

import dynamic from 'next/dynamic';
import { useModal } from '@/store/use-modal-store';

const InvoicePdfPreviewModal = dynamic(
  () =>
    import('@/components/modals/invoice/invoice-pdf-preview-modal').then(
      (mod) => mod.InvoicePdfPreviewModal
    ),
  { ssr: false }
);

export function InvoiceModalContainer() {
  const invoicePdfPreviewModal = useModal('invoicePdfPreviewModal');

  return (
    <>
      {invoicePdfPreviewModal.isOpen && invoicePdfPreviewModal.props && (
        <InvoicePdfPreviewModal />
      )}
    </>
  );
}
