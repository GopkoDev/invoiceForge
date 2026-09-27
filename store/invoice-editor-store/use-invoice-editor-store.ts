'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { InvoiceFormData } from '@/types/invoice/types';
import { InvoiceEditorState, InvoiceEditorInitData, TotalsChanged } from './types';
import { ActionFailure } from '@/types/actions';
import { redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';
import {
  generateInvoiceNumber,
  createInvoice,
  updateInvoice,
  SavedInvoice,
} from '@/lib/actions/invoice-actions/invoice-actions';
import {
  normalizeData,
  recalculateComputedValues,
  createInitialFormData,
  createNewItem,
  createEmptyComputedValues,
  createEmptyNormalizedData,
} from './helpers';
import { v4 as uuidv4 } from 'uuid';

export const useInvoiceEditorStore = create<InvoiceEditorState>()((
  set,
  get
) => {
  const initialFormData = createInitialFormData();

  // Turns a failed save into the right UI state (AC-08, AC-14, AC-15, AC-17): TOTALS_CHANGED
  // opens SCR-15, fieldErrors land next to the offending fields, everything else is a toast
  // (FAILED gets a Retry action that resubmits with the same options).
  function handleSaveFailure(
    result: ActionFailure,
    retry: () => void
  ): void {
    // AC-21: a stale session's save must send the device to sign-in, not just toast a
    // generic error and leave it on the editor.
    if (redirectIfUnauthorized(result)) {
      return;
    }

    if (result.details?.kind === 'TOTALS_CHANGED') {
      set({
        totalsChanged: {
          oldTotal: result.details.oldTotal,
          newTotal: result.details.newTotal,
        },
      });
      return;
    }

    if (result.fieldErrors) {
      set({ fieldErrors: result.fieldErrors });
      return;
    }

    if (result.code === 'FAILED') {
      toast.error(result.error || 'Error saving invoice.', {
        action: { label: 'Retry', onClick: retry },
      });
      return;
    }

    toast.error(result.error || 'Error saving invoice.');
  }

  // On success the server's figures replace whatever the browser had (AC-06, AC-13), and any
  // prior field error / totals confirmation is cleared.
  function applySavedInvoice(saved: SavedInvoice): void {
    const state = get();
    set({
      formData: { ...state.formData, invoiceNumber: saved.invoiceNumber, status: saved.status },
      invoiceId: saved.id,
      subtotal: saved.subtotal,
      taxAmount: saved.taxAmount,
      total: saved.total,
      fieldErrors: undefined,
      totalsChanged: null,
      hasUnsavedChanges: false,
    });
  }

  return {
    formData: initialFormData,
    senderProfiles: [],
    bankAccounts: [],
    customers: [],
    products: [],
    customPrices: [],
    invoiceId: undefined,
    isSaving: false,
    hasUnsavedChanges: false,
    invoiceNumberHint: undefined,
    fieldErrors: undefined,
    totalsChanged: null,
    legacy: null,
    ...createEmptyNormalizedData(),
    ...createEmptyComputedValues(),

    // ============================================================
    // Methods
    // ============================================================
    initialize: (data: InvoiceEditorInitData) => {
      const formData = data.initialData || createInitialFormData();
      const normalizedData = normalizeData({
        senderProfiles: data.senderProfiles,
        bankAccounts: data.bankAccounts,
        customers: data.customers,
        products: data.products,
        customPrices: data.customPrices,
      });

      const baseState = {
        formData,
        senderProfiles: data.senderProfiles,
        bankAccounts: data.bankAccounts,
        customers: data.customers,
        products: data.products,
        customPrices: data.customPrices,
        invoiceId: data.invoiceId,
        isSaving: false,
        hasUnsavedChanges: false,
        invoiceNumberHint: undefined,
        fieldErrors: undefined,
        totalsChanged: null,
        legacy: data.legacy ?? null,
        ...normalizedData,
      };

      const computedValues = recalculateComputedValues(baseState);

      set({
        ...baseState,
        ...computedValues,
      });
    },

    updateField: <K extends keyof InvoiceFormData>(
      key: K,
      value: InvoiceFormData[K]
    ) => {
      const state = get();
      const newFormData = { ...state.formData, [key]: value };

      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    updateFields: (updates: Partial<InvoiceFormData>) => {
      const state = get();
      const newFormData = { ...state.formData, ...updates };

      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    selectSenderProfile: async (id: string) => {
      const state = get();

      const senderBankAccounts =
        state.bankAccountsBySenderProfileId.get(id) || [];

      const defaultBankAccount = senderBankAccounts.find(
        (account) => account.isDefault
      );
      const selectedBankAccount = defaultBankAccount || senderBankAccounts[0];

      // An empty number field is the only signal a number is system-proposed (AC-06, AC-11): the
      // proposed number is exposed as a separate hint, never merged into the value the Freelancer
      // would submit. This also clears a moved invoice's old number — A's number is never
      // proposed again under B.
      const updates: Partial<InvoiceFormData> = {
        senderProfileId: id,
        bankAccountId: selectedBankAccount?.id || '',
        invoiceNumber: '',
      };

      if (selectedBankAccount) {
        updates.currency = selectedBankAccount.currency;
      }

      const newFormData = { ...state.formData, ...updates };
      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        invoiceNumberHint: undefined,
        ...computedValues,
      });

      const result = await generateInvoiceNumber(id);
      if (result.success) {
        set({ invoiceNumberHint: result.data });
      }
    },

    selectBankAccount: (id: string) => {
      const state = get();
      const bankAccount = state.bankAccountsById.get(id);

      const updates: Partial<InvoiceFormData> = {
        bankAccountId: id,
      };

      if (bankAccount) {
        updates.currency = bankAccount.currency;
      }

      const newFormData = { ...state.formData, ...updates };
      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    selectCustomer: (id: string) => {
      const state = get();
      const newFormData = { ...state.formData, customerId: id };
      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    addItem: () => {
      const state = get();
      const newItem = createNewItem();
      const newItems = [...state.formData.items, newItem];
      const newFormData = { ...state.formData, items: newItems };

      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    addCustomItem: () => {
      const state = get();
      const newItem = { ...createNewItem(), productId: 'custom' };
      const newItems = [...state.formData.items, newItem];
      const newFormData = { ...state.formData, items: newItems };

      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    updateItem: (id, updates) => {
      const state = get();
      const newItems = state.formData.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      );

      const newFormData = { ...state.formData, items: newItems };
      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    deleteItem: (id) => {
      const state = get();
      const newItems = state.formData.items.filter((item) => item.id !== id);
      const newFormData = { ...state.formData, items: newItems };

      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    duplicateItem: (id) => {
      const state = get();
      const itemIndex = state.formData.items.findIndex(
        (item) => item.id === id
      );
      if (itemIndex === -1) return;

      const itemToDuplicate = state.formData.items[itemIndex];
      const duplicatedItem = {
        ...itemToDuplicate,
        id: uuidv4(),
      };

      const newItems = [...state.formData.items];
      newItems.splice(itemIndex + 1, 0, duplicatedItem);

      const newFormData = { ...state.formData, items: newItems };
      const computedValues = recalculateComputedValues({
        ...state,
        formData: newFormData,
      });

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
        ...computedValues,
      });
    },

    reorderItems: (oldIndex, newIndex) => {
      const state = get();
      const newItems = arrayMove(state.formData.items, oldIndex, newIndex);
      const newFormData = { ...state.formData, items: newItems };

      set({
        formData: newFormData,
        hasUnsavedChanges: true,
      });
    },

    // UI state actions
    setIsSaving: (isSaving) => {
      set({ isSaving });
    },

    markAsSaved: () => {
      set({ hasUnsavedChanges: false });
    },

    saveInvoice: async (options?: { confirmedTotals?: TotalsChanged }) => {
      const state = get();
      set({ isSaving: true, fieldErrors: undefined, totalsChanged: null });

      const payload = options?.confirmedTotals
        ? { ...state.formData, confirmedTotals: options.confirmedTotals }
        : state.formData;
      const retry = () => get().saveInvoice(options);

      try {
        if (state.invoiceId) {
          // Update existing invoice
          const result = await updateInvoice(state.invoiceId, payload);
          if (result.success) {
            applySavedInvoice(result.data);
            toast.success('Invoice updated');
          } else {
            handleSaveFailure(result, retry);
          }
        } else {
          // Create new invoice
          const result = await createInvoice(payload);
          if (result.success) {
            applySavedInvoice(result.data);
            toast.success('Invoice created');
            return; // Router redirect will be handled in component
          } else {
            handleSaveFailure(result, retry);
          }
        }
      } catch {
        toast.error('Error saving invoice');
      } finally {
        set({ isSaving: false });
      }
    },

    clearTotalsChanged: () => {
      set({ totalsChanged: null });
    },

    reset: () => {
      const formData = createInitialFormData();
      set({
        formData,
        senderProfiles: [],
        bankAccounts: [],
        customers: [],
        products: [],
        customPrices: [],
        invoiceId: undefined,
        isSaving: false,
        hasUnsavedChanges: false,
        invoiceNumberHint: undefined,
        fieldErrors: undefined,
        totalsChanged: null,
        legacy: null,
        ...createEmptyNormalizedData(),
        ...createEmptyComputedValues(),
      });
    },
  };
});

// ============================================
// Selectors for optimized subscriptions
// ============================================

export const useFormData = () =>
  useInvoiceEditorStore(useShallow((state) => state.formData));

export const useInvoiceNumber = () =>
  useInvoiceEditorStore((state) => state.formData.invoiceNumber);

export const useInvoiceStatus = () =>
  useInvoiceEditorStore((state) => state.formData.status);

export const usePoNumber = () =>
  useInvoiceEditorStore((state) => state.formData.poNumber);

export const useInvoiceCurrency = () =>
  useInvoiceEditorStore((state) => state.invoiceCurrency);

export const useSelectedSenderProfile = () =>
  useInvoiceEditorStore((state) => state.selectedSenderProfile);

export const useSelectedCustomer = () =>
  useInvoiceEditorStore((state) => state.selectedCustomer);

export const useSelectedBankAccount = () =>
  useInvoiceEditorStore((state) => state.selectedBankAccount);

export const useSenderProfileOptions = () =>
  useInvoiceEditorStore(useShallow((state) => state.senderProfileOptions));

export const useAvailableBankAccounts = () =>
  useInvoiceEditorStore(useShallow((state) => state.availableBankAccounts));

export const useCustomers = () =>
  useInvoiceEditorStore(useShallow((state) => state.customers));

export const useGroupedProducts = () =>
  useInvoiceEditorStore(useShallow((state) => state.groupedProducts));

export const useInvoiceItems = () =>
  useInvoiceEditorStore(useShallow((state) => state.formData.items));

export const useInvoiceItem = (itemId: string) =>
  useInvoiceEditorStore(
    (state) => state.formData.items.find((i) => i.id === itemId)!
  );

export const useInvalidItems = () =>
  useInvoiceEditorStore(useShallow((state) => state.invalidItems));

export const useHasUnsavedChanges = () =>
  useInvoiceEditorStore((state) => state.hasUnsavedChanges);

export const useIsSaving = () =>
  useInvoiceEditorStore((state) => state.isSaving);

export const useIsEditingSentInvoice = () =>
  useInvoiceEditorStore((state) => state.isEditingSentInvoice);

export const useInvoiceId = () =>
  useInvoiceEditorStore((state) => state.invoiceId);

export const useInvoiceNumberHint = () =>
  useInvoiceEditorStore((state) => state.invoiceNumberHint);

export const useFieldErrors = () =>
  useInvoiceEditorStore(useShallow((state) => state.fieldErrors));

export const useTotalsChanged = () =>
  useInvoiceEditorStore(useShallow((state) => state.totalsChanged));

export const useLegacy = () =>
  useInvoiceEditorStore(useShallow((state) => state.legacy));

export const useSummary = () =>
  useInvoiceEditorStore(
    useShallow((state) => ({
      subtotal: state.subtotal,
      taxAmount: state.taxAmount,
      total: state.total,
      taxRate: state.formData.taxRate,
      discount: state.formData.discount,
      shipping: state.formData.shipping,
    }))
  );

export const useNotesAndTerms = () =>
  useInvoiceEditorStore(
    useShallow((state) => ({
      notes: state.formData.notes,
      terms: state.formData.terms,
    }))
  );

export const useInvoiceDates = () =>
  useInvoiceEditorStore(
    useShallow((state) => ({
      issueDate: state.formData.issueDate,
      dueDate: state.formData.dueDate,
    }))
  );

// Actions export for convenience
export const useInvoiceEditorActions = () =>
  useInvoiceEditorStore(
    useShallow((state) => ({
      initialize: state.initialize,
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
      setIsSaving: state.setIsSaving,
      markAsSaved: state.markAsSaved,
      saveInvoice: state.saveInvoice,
      clearTotalsChanged: state.clearTotalsChanged,
      reset: state.reset,
    }))
  );
