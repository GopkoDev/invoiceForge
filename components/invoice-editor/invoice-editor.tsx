'use client';

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle } from 'lucide-react';
import { InvoiceEditorData } from '@/types/invoice/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useModal } from '@/store/use-modal-store';
import { InvoiceEditorHeader } from './invoice-editor-header';
import { PDFPreviewPanel } from './pdf-preview-panel';
import { InvoiceEditorForm } from './invoice-editor-form';
import { EditSentedInvoiceAlert } from './edit-sented-invoice-alert';
import { InvoiceEditorResizePanels } from './invoice-editor-resize-panels';

// SCR-15's dialog is the shared, T15-extended ConfirmationModal (sad.md §4 "modals go through
// store/use-modal-store.ts"); use-editor-header-buttons.tsx opens it on CONFLICT TOTALS_CHANGED.
const ConfirmationModal = dynamic(
  () =>
    import(
      '@/components/modals/global-modals/confirmation-modal/confirmation-modal'
    ).then((mod) => mod.ConfirmationModal),
  { ssr: false }
);

import {
  useFormData,
  useSelectedSenderProfile,
  useSelectedCustomer,
  useSelectedBankAccount,
  useSummary,
  useIsEditingSentInvoice,
  useInvoiceEditorActions,
  useInvalidItems,
  useLegacy,
} from '@/store/invoice-editor-store';

// The contract's shared-number text (lib/actions/invoice-actions/invoice-actions.ts
// LEGACY_SHARED_NUMBER_MESSAGE, verbatim) — the same message a save's CONFLICT would show under
// the number field, shown up front here so the Freelancer knows to fix it before trying to save
// (screens.md §SCR-03 "legacy-shared-number", AC-17).
const LEGACY_SHARED_NUMBER_MESSAGE =
  'This invoice number is also used by another invoice. Change it to a free one to save.';

interface InvoiceEditorProps {
  data: InvoiceEditorData;
}

export function InvoiceEditor({ data }: InvoiceEditorProps) {
  const formData = useFormData();
  const selectedSenderProfile = useSelectedSenderProfile();
  const selectedCustomer = useSelectedCustomer();
  const selectedBankAccount = useSelectedBankAccount();
  const { subtotal, taxAmount, total } = useSummary();
  const isEditingSentInvoice = useIsEditingSentInvoice();
  const invalidItems = useInvalidItems();
  const legacy = useLegacy();

  const pdfFormData = useMemo(() => {
    const invalidItemIds = new Set(invalidItems.map((inv) => inv.item.id));
    return {
      ...formData,
      items: formData.items.filter((item) => !invalidItemIds.has(item.id)),
    };
  }, [formData, invalidItems]);

  const { initialize, reset } = useInvoiceEditorActions();
  const confirmationModal = useModal('confirmationModal');

  useEffect(() => {
    initialize(data);

    return () => {
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-background flex h-screen flex-col">
      <InvoiceEditorHeader />

      {isEditingSentInvoice && <EditSentedInvoiceAlert />}

      {legacy?.sharedNumber && (
        <section className="bg-background mt-3 flex border-b">
          <Alert variant="destructive" className="mx-4 mb-3 lg:mx-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{LEGACY_SHARED_NUMBER_MESSAGE}</AlertDescription>
          </Alert>
        </section>
      )}

      <InvoiceEditorResizePanels
        FormComponent={<InvoiceEditorForm />}
        PDFPreviewComponent={
          <PDFPreviewPanel
            formData={pdfFormData}
            senderProfile={selectedSenderProfile}
            customer={selectedCustomer}
            bankAccount={selectedBankAccount}
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
          />
        }
      />

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
    </div>
  );
}
