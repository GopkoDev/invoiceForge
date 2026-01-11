'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { InvoiceFormData } from '@/types/invoice/types';
import { InvoiceEditorState, InvoiceEditorInitData } from './types';
import {
  generateInvoiceNumber,
  createInvoice,
  updateInvoice,
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

      const updates: Partial<InvoiceFormData> = {
        senderProfileId: id,
        bankAccountId: selectedBankAccount?.id || '',
      };

      if (selectedBankAccount) {
        updates.currency = selectedBankAccount.currency;
      }

      const result = await generateInvoiceNumber(id);
      if (result.success && result.data) {
        updates.invoiceNumber = result.data;
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

    saveInvoice: async () => {
      const state = get();
      set({ isSaving: true });

      try {
        if (state.invoiceId) {
          // Update existing invoice
          const result = await updateInvoice(state.invoiceId, state.formData);
          if (result.success) {
            get().markAsSaved();
            toast.success('Invoice updated');
          } else {
            toast.error(result.error || 'Error updating invoice');
          }
        } else {
          // Create new invoice
          const result = await createInvoice(state.formData);
          if (result.success && result.data) {
            get().markAsSaved();
            toast.success('Invoice created');
            // Update invoiceId in store
            set({ invoiceId: result.data.id });
            return; // Router redirect will be handled in component
          } else {
            toast.error(result.error || 'Error creating invoice');
          }
        }
      } catch {
        toast.error('Error saving invoice');
      } finally {
        set({ isSaving: false });
      }
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
      reset: state.reset,
    }))
  );
