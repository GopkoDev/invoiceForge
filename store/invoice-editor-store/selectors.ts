'use client';

import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { InvoiceStatus } from '@/types/invoice/types';
import type { InvoiceEditorState } from './types';
import { editorModeOf, storedAmountsToPrint } from './helpers';
import type { InvoiceEditorStoreApi } from './create-invoice-editor-store';

export const InvoiceEditorStoreContext = createContext<InvoiceEditorStoreApi | null>(null);

/** The editor's store instance, for reads outside React's render (event handlers, async callbacks). */
export function useInvoiceEditorStoreApi(): InvoiceEditorStoreApi {
  const store = useContext(InvoiceEditorStoreContext);
  if (!store) throw new Error('The invoice editor store is only available inside <InvoiceEditorProvider>.');
  return store;
}

export function useInvoiceEditor<T>(selector: (state: InvoiceEditorState) => T): T {
  return useStore(useInvoiceEditorStoreApi(), selector);
}

// ============================================
// Selectors for optimized subscriptions
// ============================================

export const useFormData = () =>
  useInvoiceEditor(useShallow((state) => state.formData));

export const useInvoiceNumber = () =>
  useInvoiceEditor((state) => state.formData.invoiceNumber);

// The status the header badge shows: Overdue for a past-due pending invoice, else the stored one.
export const useInvoiceStatus = () =>
  useInvoiceEditor((state) =>
    state.derivedOverdue ? ('OVERDUE' satisfies InvoiceStatus) : state.formData.status,
  );

export const usePoNumber = () =>
  useInvoiceEditor((state) => state.formData.poNumber);

export const useInvoiceCurrency = () =>
  useInvoiceEditor((state) => state.invoiceCurrency);

export const useSelectedSenderProfile = () =>
  useInvoiceEditor((state) => state.selectedSenderProfile);

export const useSelectedCustomer = () =>
  useInvoiceEditor((state) => state.selectedCustomer);

export const useSelectedBankAccount = () =>
  useInvoiceEditor((state) => state.selectedBankAccount);

export const useSenderProfileOptions = () =>
  useInvoiceEditor(useShallow((state) => state.senderProfileOptions));

export const useAvailableBankAccounts = () =>
  useInvoiceEditor(useShallow((state) => state.availableBankAccounts));

export const useCustomers = () =>
  useInvoiceEditor(useShallow((state) => state.customers));

export const useGroupedProducts = () =>
  useInvoiceEditor(useShallow((state) => state.groupedProducts));

export const useInvoiceItems = () =>
  useInvoiceEditor(useShallow((state) => state.formData.items));

export const useInvoiceItem = (itemId: string) =>
  useInvoiceEditor(
    (state) => state.formData.items.find((i) => i.id === itemId)!
  );

export const useHasUnsavedChanges = () =>
  useInvoiceEditor((state) => state.hasUnsavedChanges);

export const useIsSaving = () =>
  useInvoiceEditor((state) => state.isSaving);

/** invoice-integrity T16: new / draft / issued / cancelled, from the stored status (SCR-02). */
export const useEditorMode = () =>
  useInvoiceEditor((state) => editorModeOf(state.invoiceId, state.storedStatus));

/**
 * What the mode locks (SCR-02): `locked` — everything but the due date, notes, payment terms and PO
 * number (issued and cancelled); `readOnly` — every field (cancelled).
 */
export const useEditorLocks = () =>
  useInvoiceEditor(
    useShallow((state) => {
      const mode = editorModeOf(state.invoiceId, state.storedStatus);
      return { locked: mode === 'issued' || mode === 'cancelled', readOnly: mode === 'cancelled' };
    })
  );

/** The issued details shown as text once the invoice is issued (ADR-0001). */
export const useIssuedDetails = () =>
  useInvoiceEditor(useShallow((state) => state.issuedDetails));

/** The stored figures an issued or cancelled invoice prints; undefined while the invoice is a draft or new. */
export const useStoredAmountsToPrint = () =>
  useInvoiceEditor((state) => storedAmountsToPrint(state));

export const useInvoiceId = () =>
  useInvoiceEditor((state) => state.invoiceId);

export const useInvoiceNumberHint = () =>
  useInvoiceEditor((state) => state.invoiceNumberHint);

export const useInvoiceHintStatus = () =>
  useInvoiceEditor((state) => state.hintStatus);

export const useFieldErrors = () =>
  useInvoiceEditor(useShallow((state) => state.fieldErrors));

export const useTotalsChanged = () =>
  useInvoiceEditor(useShallow((state) => state.totalsChanged));

/** invoice-integrity T18: the CHANGED_ELSEWHERE error, the stale flag and a failed reload. */
export const useChangedElsewhere = () => useInvoiceEditor((state) => state.changedElsewhere);
export const useIsStale = () => useInvoiceEditor((state) => state.stale);
export const useReloadFailed = () => useInvoiceEditor((state) => state.reloadFailed);

/** The ISSUED_INVOICE_LOCKED explanation from the last save, shown above the form (SCR-02). */
export const useLockedRefusal = () => useInvoiceEditor((state) => state.lockedRefusal);

/** The dismissable "not saved because the invoice is now issued" notice (AC-05b). */
export const useIssuedEditsDroppedNotice = () =>
  useInvoiceEditor((state) => state.issuedEditsDroppedNotice);

export const useLegacy = () =>
  useInvoiceEditor(useShallow((state) => state.legacy));

export const useSummary = () =>
  useInvoiceEditor(
    useShallow((state) => ({
      // An issued or cancelled invoice shows the amounts stored on it (ADR-0002), not a recalculation.
      ...(storedAmountsToPrint(state) ?? { subtotal: state.subtotal, taxAmount: state.taxAmount, total: state.total }),
      taxRate: state.formData.taxRate,
      discount: state.formData.discount,
      shipping: state.formData.shipping,
    }))
  );

export const useNotesAndTerms = () =>
  useInvoiceEditor(
    useShallow((state) => ({
      notes: state.formData.notes,
      terms: state.formData.terms,
      paymentTerms: state.formData.paymentTerms,
    }))
  );

export const useInvoiceDates = () =>
  useInvoiceEditor(
    useShallow((state) => ({
      issueDate: state.formData.issueDate,
      dueDate: state.formData.dueDate,
    }))
  );

// Actions export for convenience
export const useInvoiceEditorActions = () =>
  useInvoiceEditor(
    useShallow((state) => ({
      initialize: state.initialize,
      requestNumberHint: state.requestNumberHint,
      updateField: state.updateField,
      updateFields: state.updateFields,
      selectSenderProfile: state.selectSenderProfile,
      selectBankAccount: state.selectBankAccount,
      selectCustomer: state.selectCustomer,
      addItem: state.addItem,
      addCustomItem: state.addCustomItem,
      updateItem: state.updateItem,
      deleteItem: state.deleteItem,
      duplicateItem: state.duplicateItem,
      reorderItems: state.reorderItems,
      save: state.save,
      dismissIssuedEditsDroppedNotice: state.dismissIssuedEditsDroppedNotice,
      clearTotalsChanged: state.clearTotalsChanged,
      confirmTotalsChanged: state.confirmTotalsChanged,
      markStale: state.markStale,
      reloadInvoice: state.reloadInvoice,
    }))
  );
