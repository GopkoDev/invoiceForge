'use client';

import { useEffect, useMemo } from 'react';
import { InvoiceEditorData } from '@/types/invoice/types';
import { InvoiceEditorHeader } from './invoice-editor-header';
import { PDFPreviewPanel } from './pdf-preview-panel';
import { InvoiceEditorForm } from './invoice-editor-form';
import { EditSentedInvoiceAlert } from './edit-sented-invoice-alert';
import { InvoiceEditorResizePanels } from './invoice-editor-resize-panels';

import {
  useFormData,
  useSelectedSenderProfile,
  useSelectedCustomer,
  useSelectedBankAccount,
  useSummary,
  useIsEditingSentInvoice,
  useInvoiceEditorActions,
  useInvalidItems,
} from '@/store/invoice-editor-store';

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

  const pdfFormData = useMemo(() => {
    const invalidItemIds = new Set(invalidItems.map((inv) => inv.item.id));
    return {
      ...formData,
      items: formData.items.filter((item) => !invalidItemIds.has(item.id)),
    };
  }, [formData, invalidItems]);

  const { initialize, reset } = useInvoiceEditorActions();

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
    </div>
  );
}
