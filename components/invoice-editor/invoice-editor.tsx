'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle } from 'lucide-react';
import { InvoiceEditorData } from '@/types/invoice/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useModal } from '@/store/use-modal-store';
import { InvoiceEditorHeader } from './invoice-editor-header';
import { PDFPreviewPanel } from './pdf-preview-panel';
import { InvoiceEditorForm } from './invoice-editor-form';
import { EditorModeAlert } from './edit-sented-invoice-alert';
import { InvoiceEditorResizePanels } from './invoice-editor-resize-panels';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { LoadError } from '@/components/layout/content-area/load-error';
import { useInvoiceReload } from '@/hooks/use-invoice-reload';

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
  useSummary,
  useEditorMode,
  useInvoiceEditorActions,
  useLegacy,
  usePdfParties,
  useIsStale,
  useReloadFailed,
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
  // The preview renders the form as it stands, every line included (invoice-integrity AC-15);
  // once issued, its parties are the issued details (SCR-03 decision 4).
  const pdfFormData = useFormData();
  const { senderProfile, customer, bankAccount } = usePdfParties();
  const { subtotal, taxAmount, total } = useSummary();
  const mode = useEditorMode();
  const legacy = useLegacy();
  const stale = useIsStale();
  const reloadFailed = useReloadFailed();
  const reload = useInvoiceReload();

  // SCR-05 `reloading`: the stale Alert's Reload shows a Spinner and is disabled while the reload is
  // in flight, so a double click reloads once. The ref closes the gap before the state re-renders.
  const [reloading, setReloading] = useState(false);
  const reloadingRef = useRef(false);
  const handleReload = async () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    setReloading(true);
    try {
      await reload();
    } finally {
      reloadingRef.current = false;
      setReloading(false);
    }
  };

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

      <EditorModeAlert mode={mode} />

      {/* invoice-integrity T18 (SCR-02 stale): SCR-05 closed without reloading; a save re-opens it. */}
      {stale && !reloadFailed && (
        <section className="bg-background mt-3 flex border-b">
          <Alert className="mx-4 mb-3 flex items-center justify-between gap-3 lg:mx-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>This invoice was changed elsewhere. Reload it to continue.</AlertDescription>
            <Button size="sm" variant="outline" onClick={() => void handleReload()} disabled={reloading}>
              {reloading ? <Spinner className="mr-1" /> : null}
              Reload
            </Button>
          </Alert>
        </section>
      )}

      {reloadFailed && (
        <section className="bg-background mt-3 flex border-b">
          <LoadError onRetry={async () => void (await reload())} />
        </section>
      )}

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
            senderProfile={senderProfile}
            customer={customer}
            bankAccount={bankAccount}
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
