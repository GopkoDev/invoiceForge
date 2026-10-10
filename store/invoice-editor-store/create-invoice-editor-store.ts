'use client';

import { toast } from 'sonner';
import { createStore, type StoreApi } from 'zustand';
import { arrayMove } from '@dnd-kit/sortable';
import { InvoiceFormData, InvoiceEditorData } from '@/types/invoice/types';
import { InvoiceEditorState, InvoiceEditorInitData, SaveIntent, HintStatus } from './types';
import { goToSignIn, redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';
import {
  generateInvoiceNumber,
  getInvoiceEditorData,
} from '@/lib/actions/invoice-actions/invoice-actions';
import {
  normalizeData,
  recalculateComputedValues,
  createNewItem,
  loadedDatesOf,
  withLocalDays,
} from './helpers';
import { createSaveCommand } from './save-command';

export type InvoiceEditorStoreApi = StoreApi<InvoiceEditorState>;

/** The state an editor starts from: the server's data, fully computed. */
function buildInitialState(data: InvoiceEditorInitData | InvoiceEditorData) {
  // The server always sends the form (an opened invoice, or a new invoice's defaults with its today).
  if (!data.initialData) throw new Error('The invoice editor needs initialData from the server.');
  const formData = withLocalDays(data.initialData);
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
    loadedDates: data.initialData && data.invoiceId ? loadedDatesOf(data.initialData) : null,
    isSaving: false,
    hasUnsavedChanges: false,
    revision: 0,
    issuedEditsDroppedNotice: null,
    invoiceNumberHint: undefined,
    // A new invoice that already has a sender shows the loading state in the first HTML; the request
    // itself starts on mount (requestNumberHint).
    hintStatus: (!data.invoiceId && data.initialData.invoiceNumber === '' && data.initialData.senderProfileId !== ''
      ? 'loading'
      : 'idle') as HintStatus,
    fieldErrors: undefined,
    totalsChanged: null,
    totalsChangedIntent: 'save' as SaveIntent,
    legacy: data.legacy ?? null,
    derivedOverdue: data.derivedOverdue ?? false,
    storedStatus: data.initialData && data.invoiceId ? data.initialData.status : null,
    issuedDetails: data.issuedDetails ?? null,
    storedAmounts: data.storedAmounts ?? null,
    lockedRefusal: null,
    loadedVersion: data.invoiceId && data.initialData ? (data.version ?? null) : null,
    changedElsewhere: null,
    stale: false,
    reloadFailed: false,
    ...normalizedData,
  };

  return { ...baseState, ...recalculateComputedValues(baseState) };
}

/**
 * One editor store per mounted editor (ADR-0003), filled synchronously from the server's data so the
 * first render already shows the opened invoice.
 */
let storeCount = 0;

// A request cut off by leaving the page rejects too; that is the Freelancer's own navigation, not a
// dead session. Watches `pagehide` for the lifetime of one request.
function watchPageUnload() {
  let unloading = false;
  const onHide = () => {
    unloading = true;
  };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
  return {
    isUnloading: () => unloading,
    stop: () => {
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
    },
  };
}

export function createInvoiceEditorStore(
  initial: InvoiceEditorInitData | InvoiceEditorData
): InvoiceEditorStoreApi {
  return createStore<InvoiceEditorState>()((set, get) => {
    // Changes on every initialize() and dispose(). A save captures it when it starts and drops its
    // result when it no longer matches, so a slow response for invoice A can never write A's id,
    // number or dates into the editor the Freelancer has since opened for something else.
    let sessionToken = 0;
    // What the last dispose() changed, for resume(); any later initialize() or dispose() forgets it.
    let undoDispose: { token: number; isSaving: boolean } | null = null;
    // The mount request runs once per store (StrictMode mounts twice); initialize() re-arms it.
    let hintRequested = false;
    const failureToast = { id: `invoice-save-failed-${++storeCount}`, shown: false };

    const { save } = createSaveCommand({
      get,
      set,
      sessionToken: () => sessionToken,
      failureToast,
    });

    return {
      ...buildInitialState(initial),

      // ============================================================
      // Methods
      // ============================================================
      initialize: (data: InvoiceEditorInitData) => {
        sessionToken += 1;
        undoDispose = null;
        hintRequested = false;
        set(buildInitialState(data));
      },

      // The editor was left: every in-flight save or Retry from before now fails the token check,
      // and the failure message offering Retry goes away with the page.
      dispose: () => {
        undoDispose = { token: sessionToken, isSaving: get().isSaving };
        sessionToken += 1;
        // A save still in flight no longer clears this itself (its token is stale): a reused store
        // must not stay stuck on isSaving.
        set({ isSaving: false });
        if (failureToast.shown) toast.dismiss(failureToast.id);
        failureToast.shown = false;
      },

      resume: () => {
        if (!undoDispose || sessionToken !== undoDispose.token + 1) return;
        sessionToken = undoDispose.token;
        set({ isSaving: undoDispose.isSaving });
        undoDispose = null;
      },

      // Asks for the proposed number of a new invoice that opened with a sender profile. Whatever the
      // outcome, the loading state ends: a hint, or "Assigned on save".
      requestNumberHint: async () => {
        const { hintStatus, formData } = get();
        if (hintRequested || hintStatus !== 'loading') return;
        hintRequested = true;
        const id = formData.senderProfileId;
        const token = sessionToken;
        const unload = watchPageUnload();
        const settle = (patch: Partial<InvoiceEditorState>) => {
          // A later sender pick owns the hint now.
          const current = get();
          if (current.formData.senderProfileId === id && current.hintStatus === 'loading') set(patch);
        };
        try {
          const result = await generateInvoiceNumber(id);
          if (redirectIfUnauthorized(result)) return;
          if (result.success) settle({ invoiceNumberHint: result.data, hintStatus: 'ready' });
          else settle({ hintStatus: 'failed' });
        } catch {
          settle({ hintStatus: 'failed' });
          // architecture-hardening AC-21: a rejected call is treated like UNAUTHORIZED, unless the
          // editor was left (disposed / re-initialized) or the page is unloading (T45b).
          if (token === sessionToken && !unload.isUnloading()) goToSignIn();
        } finally {
          unload.stop();
        }
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
          revision: state.revision + 1,
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
          revision: state.revision + 1,
          ...computedValues,
        });
      },

      selectSenderProfile: async (id: string) => {
        const state = get();

        // F-42: re-selecting the CURRENT sender profile is not a move (architecture-hardening AC-11
        // is about actually moving an invoice to a DIFFERENT profile) — a no-op reselect must not
        // wipe the number and renumber under the same profile.
        if (id === state.formData.senderProfileId) {
          return;
        }

        const senderBankAccounts =
          state.bankAccountsBySenderProfileId.get(id) || [];

        const defaultBankAccount = senderBankAccounts.find(
          (account) => account.isDefault
        );
        const selectedBankAccount = defaultBankAccount || senderBankAccounts[0];

        // An empty number field is the only signal a number is system-proposed (architecture-hardening
        // AC-06, AC-11): the proposed number is exposed as a separate hint, never merged into the
        // value the Freelancer would submit. This also clears a moved invoice's old number — A's number is never
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
          revision: state.revision + 1,
          invoiceNumberHint: undefined,
          hintStatus: 'loading',
          ...computedValues,
        });

        const token = sessionToken;
        const unload = watchPageUnload();
        try {
          const result = await generateInvoiceNumber(id);
          if (redirectIfUnauthorized(result)) return;
          // A later pick, re-initialize or leaving the editor owns the hint now.
          if (result.success && token === sessionToken && get().formData.senderProfileId === id) {
            set({ invoiceNumberHint: result.data, hintStatus: 'ready' });
          } else if (token === sessionToken && get().formData.senderProfileId === id) {
            set({ hintStatus: 'failed' });
          }
        } catch {
          if (token === sessionToken) set({ hintStatus: 'failed' });
          // architecture-hardening AC-21: a rejected call is treated like UNAUTHORIZED, unless the
          // editor was left (disposed / re-initialized) or the page is unloading (T45b).
          if (token === sessionToken && !unload.isUnloading()) goToSignIn();
        } finally {
          unload.stop();
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
          revision: state.revision + 1,
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
          revision: state.revision + 1,
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
          revision: state.revision + 1,
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
          revision: state.revision + 1,
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
          revision: state.revision + 1,
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
          revision: state.revision + 1,
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
          id: crypto.randomUUID(),
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
          revision: state.revision + 1,
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
          revision: state.revision + 1,
        });
      },

      save,

      dismissIssuedEditsDroppedNotice: () => {
        set({ issuedEditsDroppedNotice: null });
      },

      confirmTotalsChanged: async () => {
        const { totalsChanged, totalsChangedIntent } = get();
        if (totalsChanged) await save(totalsChangedIntent, { confirmedTotals: totalsChanged });
      },

      clearTotalsChanged: () => {
        set({ totalsChanged: null });
      },

      markStale: () => {
        set({ changedElsewhere: null, stale: true });
      },

      reloadInvoice: async () => {
        const { invoiceId } = get();
        try {
          const result = await getInvoiceEditorData(invoiceId);
          if (!result.success) {
            if (redirectIfUnauthorized(result)) return 'failed';
            set({ reloadFailed: true, changedElsewhere: null });
            return 'failed';
          }
          // A missing or foreign invoice comes back without initialData (the edit page's not-found).
          if (!result.data.initialData) return 'not-found';
          get().initialize(result.data);
          return 'reloaded';
        } catch {
          goToSignIn();
          return 'failed';
        }
      },
    };
  });
}
