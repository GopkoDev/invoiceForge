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
} from './selectors';
import { editorModeOf } from './helpers';
import type { EditorMode, InvoiceEditorState } from './types';

export interface PdfParties {
  senderProfile: InvoiceSenderProfile | undefined;
  customer: InvoiceCustomer | undefined;
  bankAccount: InvoiceBankAccount | undefined;
}

type PartiesSource = Pick<
  InvoiceEditorState,
  'formData' | 'issuedDetails' | 'selectedSenderProfile' | 'selectedCustomer' | 'selectedBankAccount'
> & { mode: EditorMode };

function resolvePdfParties({
  mode,
  issuedDetails: issued,
  formData,
  selectedSenderProfile: senderProfile,
  selectedCustomer: customer,
  selectedBankAccount: bankAccount,
}: PartiesSource): PdfParties {
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
}

/** The same parties read from the store's current state, for event handlers (no subscription). */
export function pdfPartiesOfState(state: InvoiceEditorState): PdfParties {
  return resolvePdfParties({ ...state, mode: editorModeOf(state.invoiceId, state.storedStatus) });
}

export function usePdfParties(): PdfParties {
  const mode = useEditorMode();
  const issuedDetails = useIssuedDetails();
  const formData = useFormData();
  const selectedSenderProfile = useSelectedSenderProfile();
  const selectedCustomer = useSelectedCustomer();
  const selectedBankAccount = useSelectedBankAccount();

  return useMemo(
    () =>
      resolvePdfParties({
        mode,
        issuedDetails,
        formData,
        selectedSenderProfile,
        selectedCustomer,
        selectedBankAccount,
      }),
    [mode, issuedDetails, formData, selectedSenderProfile, selectedCustomer, selectedBankAccount]
  );
}
