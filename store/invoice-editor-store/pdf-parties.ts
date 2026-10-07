'use client';

// invoice-integrity T16 (SCR-03 decision 4, ADR-0001): the editor's preview, Download and Print render
// the form as it stands. Once the invoice is issued that form *is* the issued details, so the sender,
// Customer and bank blocks come from them (only the logo stays the current profile's) and match the
// PDF printed from the list.
import { useMemo } from 'react';
import type { InvoiceBankAccount, InvoiceCustomer, InvoiceSenderProfile } from '@/types/invoice/types';
import {
  useEditorMode,
  useFormData,
  useIssuedDetails,
  useSelectedBankAccount,
  useSelectedCustomer,
  useSelectedSenderProfile,
} from './use-invoice-editor-store';

export interface PdfParties {
  senderProfile: InvoiceSenderProfile | undefined;
  customer: InvoiceCustomer | undefined;
  bankAccount: InvoiceBankAccount | undefined;
}

export function usePdfParties(): PdfParties {
  const mode = useEditorMode();
  const issued = useIssuedDetails();
  const formData = useFormData();
  const senderProfile = useSelectedSenderProfile();
  const customer = useSelectedCustomer();
  const bankAccount = useSelectedBankAccount();

  return useMemo(() => {
    if ((mode !== 'issued' && mode !== 'cancelled') || !issued) {
      return { senderProfile, customer, bankAccount };
    }
    return {
      senderProfile: {
        id: formData.senderProfileId,
        ...issued.sender,
        logo: senderProfile?.logo ?? null,
        invoicePrefix: senderProfile?.invoicePrefix ?? '',
        invoiceCounter: senderProfile?.invoiceCounter ?? 0,
      },
      customer: { id: formData.customerId, ...issued.customer, defaultCurrency: formData.currency },
      bankAccount: {
        id: formData.bankAccountId,
        senderProfileId: formData.senderProfileId,
        ...issued.bank,
        currency: formData.currency,
        isDefault: false,
      },
    };
  }, [mode, issued, formData, senderProfile, customer, bankAccount]);
}
