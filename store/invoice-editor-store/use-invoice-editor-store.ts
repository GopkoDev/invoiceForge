'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { InvoiceFormData, InvoiceStatus } from '@/types/invoice/types';
import { InvoiceEditorState, InvoiceEditorInitData, TotalsChanged } from './types';
import { ActionFailure } from '@/types/actions';
import {
  goToSignIn,
  redirectIfUnauthorized,
} from '@/lib/helpers/client-session-redirect';
import {
  generateInvoiceNumber,
  createInvoice,
  updateInvoice,
  getInvoiceEditorData,
  SavedInvoice,
} from '@/lib/actions/invoice-actions/invoice-actions';
import {
  normalizeData,
  recalculateComputedValues,
  createInitialFormData,
  createNewItem,
  createEmptyComputedValues,
  createEmptyNormalizedData,
  toSavePayload,
  loadedDatesOf,
  withLocalDays,
  editorModeOf,
} from './helpers';
import { v4 as uuidv4 } from 'uuid';
import { localDateToDay, storedDayToLocalDate } from '@/lib/helpers/calendar-day';

export const useInvoiceEditorStore = create<InvoiceEditorState>()((
  set,
  get
) => {
  const initialFormData = createInitialFormData();

  // Changes on every initialize() and reset(). A save captures it when it starts and drops its
  // result when it no longer matches, so a slow response for invoice A can never write A's id,
  // number or dates into the editor the Freelancer has since opened for something else.
  let sessionToken = 0;

  // F-41: the field-error keys the editor actually renders a FieldError next to
  // (invoice-details-section.tsx, summary-section.tsx, invoice-item-fields.tsx). A fieldErrors
  // key outside this set (e.g. senderProfileId/bankAccountId/customerId, or an item field the
  // editor never shows an input for) has nowhere on screen to appear, so it must not be dropped
  // silently — it gets toasted as a fallback instead.
  // invoice-integrity T17: every draft-rule key has a rendered field (SCR-02 draft — validation).
  const RENDERED_FIELD_ERROR_KEYS = new Set([
    'invoiceNumber',
    'discount',
    'shipping',
    'taxRate',
    'bankAccountId',
    'dueDate',
    'subtotal',
    'taxAmount',
    'total',
  ]);
  function isRenderedFieldErrorKey(key: string): boolean {
    if (RENDERED_FIELD_ERROR_KEYS.has(key)) return true;
    return /^items\.\d+\.(price|quantity|productId|total)$/.test(key);
  }

  // Turns a failed save into the right UI state (architecture-hardening AC-08, AC-14, AC-15,
  // AC-17): TOTALS_CHANGED opens SCR-15, fieldErrors land next to the offending fields,
  // everything else is a toast (FAILED gets a Retry action that resubmits with the same options).
  function handleSaveFailure(
    result: ActionFailure,
    retry: () => void,
    token: number
  ): void {
    // architecture-hardening AC-21: a stale session's save must send the device to sign-in, not
    // just toast a generic error and leave it on the editor. The signed-out state is global, not
    // per editor session, so this runs before the token check (same as a rejected save in the
    // catch block).
    if (redirectIfUnauthorized(result)) {
      return;
    }

    // A save that failed after the editor was reset still tells the user it was not stored, but
    // writes no state and offers no Retry (the form it would resubmit is gone).
    if (token !== sessionToken) {
      toast.error(result.error || 'Error saving invoice.');
      return;
    }

    // invoice-integrity T18 (AC-10): the invoice changed since this editor loaded it → SCR-05.
    if (result.details?.kind === 'CHANGED_ELSEWHERE') {
      set({ changedElsewhere: result.error });
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

    // invoice-integrity T17 (SCR-02 refused): a lifecycle refusal is a toast with the error verbatim.
    if (result.details?.kind === 'STATUS_NOT_ALLOWED') {
      toast.error(result.error);
      return;
    }

    // SCR-02 issued — locked-field refusal: the explanation goes in an Alert above the form.
    if (result.details?.kind === 'ISSUED_INVOICE_LOCKED') {
      set({ lockedRefusal: result.error });
    }

    if (result.fieldErrors) {
      set({ fieldErrors: result.fieldErrors });
      // F-41: a key with no rendered field gets no visible FieldError at all — toast it as a
      // fallback so the Freelancer is never left with no feedback whatsoever.
      const unrendered = Object.entries(result.fieldErrors).filter(
        ([key]) => !isRenderedFieldErrorKey(key)
      );
      if (unrendered.length > 0) {
        toast.error(unrendered.flatMap(([, messages]) => messages).join(' '));
      }
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

  // On success the server's figures replace whatever the browser had (architecture-hardening
  // AC-06, AC-13), and any prior field error / totals confirmation is cleared.
  // `submitted` is the form the save was built from: a date, number or status the Freelancer
  // changed while the save was in flight is kept, and the form stays dirty so that edit is
  // neither lost nor unguarded.
  function applySavedInvoice(
    saved: SavedInvoice,
    submitted: InvoiceFormData,
    token: number
  ): void {
    if (token !== sessionToken) return;
    const state = get();
    const untouched = state.formData === submitted;
    const storedOrEdited = (key: 'issueDate' | 'dueDate', stored: string): Date =>
      localDateToDay(state.formData[key]) === localDateToDay(submitted[key])
        ? storedDayToLocalDate(stored)
        : state.formData[key];
    // Switching the sender profile mid-save clears the number on purpose (the old profile's
    // number is never proposed under the new one), so it counts as an edit of the number.
    const senderSwitched =
      state.formData.senderProfileId !== submitted.senderProfileId;
    const storedUnlessEdited = <K extends 'invoiceNumber' | 'status'>(
      key: K,
      stored: InvoiceFormData[K]
    ): InvoiceFormData[K] =>
      state.formData[key] === submitted[key] &&
      !(key === 'invoiceNumber' && senderSwitched)
        ? stored
        : state.formData[key];
    set({
      formData: {
        ...state.formData,
        invoiceNumber: storedUnlessEdited('invoiceNumber', saved.invoiceNumber),
        status: storedUnlessEdited('status', saved.status),
        // The row's stored dates (a kept legacy / normalised value may differ from the submitted day).
        issueDate: storedOrEdited('issueDate', saved.issueDate),
        dueDate: storedOrEdited('dueDate', saved.dueDate),
      },
      derivedOverdue: saved.derivedOverdue,
      invoiceId: saved.id,
      // The mode follows what the row holds now: a draft issued by Save and issue turns issued.
      storedStatus: saved.status,
      // What the server froze in this save (null for a draft): the issued blocks and PDF show it.
      issuedDetails: saved.issuedDetails,
      // The row's version now: the next save's loadedVersion (ADR-0004).
      loadedVersion: saved.version,
      subtotal: saved.subtotal,
      taxAmount: saved.taxAmount,
      total: saved.total,
      fieldErrors: undefined,
      totalsChanged: null,
      hasUnsavedChanges: untouched ? false : state.hasUnsavedChanges,
      // F-46: the legacy shared-number Alert is computed once off the invoice as it was loaded
      // (architecture-hardening AC-17); once a save actually succeeds, that snapshot is stale and
      // must not keep warning.
      legacy: null,
      // What the row holds now: the next save compares its days against these, not the first load.
      loadedDates: { issueDate: saved.issueDate, dueDate: saved.dueDate },
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
    loadedDates: null,
    isSaving: false,
    hasUnsavedChanges: false,
    invoiceNumberHint: undefined,
    fieldErrors: undefined,
    totalsChanged: null,
    legacy: null,
    derivedOverdue: false,
    storedStatus: null,
    issuedDetails: null,
    lockedRefusal: null,
    loadedVersion: null,
    changedElsewhere: null,
    stale: false,
    reloadFailed: false,
    ...createEmptyNormalizedData(),
    ...createEmptyComputedValues(),

    // ============================================================
    // Methods
    // ============================================================
    initialize: (data: InvoiceEditorInitData) => {
      sessionToken += 1;
      const formData = data.initialData
        ? withLocalDays(data.initialData)
        : createInitialFormData();
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
        invoiceNumberHint: undefined,
        fieldErrors: undefined,
        totalsChanged: null,
        legacy: data.legacy ?? null,
        derivedOverdue: data.derivedOverdue ?? false,
        storedStatus: data.initialData && data.invoiceId ? data.initialData.status : null,
        issuedDetails: data.issuedDetails ?? null,
        lockedRefusal: null,
        loadedVersion: data.invoiceId && data.initialData ? (data.version ?? null) : null,
        changedElsewhere: null,
        stale: false,
        reloadFailed: false,
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
        invoiceNumberHint: undefined,
        ...computedValues,
      });

      const token = sessionToken;
      try {
        const result = await generateInvoiceNumber(id);
        if (redirectIfUnauthorized(result)) return;
        // A later pick, reset or re-initialize owns the hint now.
        if (result.success && token === sessionToken && get().formData.senderProfileId === id) {
          set({ invoiceNumberHint: result.data });
        }
      } catch {
        // architecture-hardening AC-21: a rejected call is treated like UNAUTHORIZED.
        goToSignIn();
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

    saveInvoice: async (options?: { confirmedTotals?: TotalsChanged; issue?: boolean }) => {
      const state = get();
      const token = sessionToken;
      set({
        isSaving: true,
        fieldErrors: undefined,
        totalsChanged: null,
        lockedRefusal: null,
        changedElsewhere: null,
      });

      // Save and issue (SCR-02): the same save, sent with status PENDING; the form keeps DRAFT
      // until the server confirms, so a refused issue leaves a draft.
      const payload = toSavePayload(
        options?.issue ? { ...state.formData, status: 'PENDING' } : state.formData,
        options?.confirmedTotals,
        state.loadedDates,
        state.loadedVersion
      );
      const retry = () => {
        // A Retry clicked after the editor was reset would save another invoice's form;
        // one clicked while a save is in flight would run a second save (a duplicate create).
        if (token === sessionToken && !get().isSaving) void get().saveInvoice(options);
      };

      try {
        if (state.invoiceId) {
          // Update existing invoice
          const result = await updateInvoice(state.invoiceId, payload);
          if (result.success) {
            applySavedInvoice(result.data, state.formData, token);
            toast.success(options?.issue ? 'Invoice issued' : 'Invoice updated');
          } else {
            handleSaveFailure(result, retry, token);
          }
        } else {
          // Create new invoice
          const result = await createInvoice(payload);
          if (result.success) {
            applySavedInvoice(result.data, state.formData, token);
            toast.success('Invoice created');
            return; // Router redirect will be handled in component
          } else {
            handleSaveFailure(result, retry, token);
          }
        }
      } catch {
        // architecture-hardening AC-21: a rejected save is treated like UNAUTHORIZED.
        goToSignIn();
      } finally {
        // A reset or re-initialize already cleared isSaving for the session that owns the store now.
        if (token === sessionToken) set({ isSaving: false });
      }
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

    reset: () => {
      sessionToken += 1;
      const formData = createInitialFormData();
      set({
        formData,
        senderProfiles: [],
        bankAccounts: [],
        customers: [],
        products: [],
        customPrices: [],
        invoiceId: undefined,
        loadedDates: null,
        isSaving: false,
        hasUnsavedChanges: false,
        invoiceNumberHint: undefined,
        fieldErrors: undefined,
        totalsChanged: null,
        legacy: null,
        derivedOverdue: false,
        storedStatus: null,
        issuedDetails: null,
        lockedRefusal: null,
        loadedVersion: null,
        changedElsewhere: null,
        stale: false,
        reloadFailed: false,
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

// The status the header badge shows: Overdue for a past-due pending invoice, else the stored one.
export const useInvoiceStatus = () =>
  useInvoiceEditorStore((state) =>
    state.derivedOverdue ? ('OVERDUE' satisfies InvoiceStatus) : state.formData.status,
  );

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

export const useHasUnsavedChanges = () =>
  useInvoiceEditorStore((state) => state.hasUnsavedChanges);

export const useIsSaving = () =>
  useInvoiceEditorStore((state) => state.isSaving);

/** invoice-integrity T16: new / draft / issued / cancelled, from the stored status (SCR-02). */
export const useEditorMode = () =>
  useInvoiceEditorStore((state) => editorModeOf(state.invoiceId, state.storedStatus));

/**
 * What the mode locks (SCR-02): `locked` — everything but the due date, notes, payment terms and PO
 * number (issued and cancelled); `readOnly` — every field (cancelled).
 */
export const useEditorLocks = () =>
  useInvoiceEditorStore(
    useShallow((state) => {
      const mode = editorModeOf(state.invoiceId, state.storedStatus);
      return { locked: mode === 'issued' || mode === 'cancelled', readOnly: mode === 'cancelled' };
    })
  );

/** The issued details shown as text once the invoice is issued (ADR-0001). */
export const useIssuedDetails = () =>
  useInvoiceEditorStore(useShallow((state) => state.issuedDetails));

export const useInvoiceId = () =>
  useInvoiceEditorStore((state) => state.invoiceId);

export const useInvoiceNumberHint = () =>
  useInvoiceEditorStore((state) => state.invoiceNumberHint);

export const useFieldErrors = () =>
  useInvoiceEditorStore(useShallow((state) => state.fieldErrors));

export const useTotalsChanged = () =>
  useInvoiceEditorStore(useShallow((state) => state.totalsChanged));

/** invoice-integrity T18: the CHANGED_ELSEWHERE error, the stale flag and a failed reload. */
export const useChangedElsewhere = () => useInvoiceEditorStore((state) => state.changedElsewhere);
export const useIsStale = () => useInvoiceEditorStore((state) => state.stale);
export const useReloadFailed = () => useInvoiceEditorStore((state) => state.reloadFailed);

/** The ISSUED_INVOICE_LOCKED explanation from the last save, shown above the form (SCR-02). */
export const useLockedRefusal = () => useInvoiceEditorStore((state) => state.lockedRefusal);

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
      paymentTerms: state.formData.paymentTerms,
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
      markStale: state.markStale,
      reloadInvoice: state.reloadInvoice,
      reset: state.reset,
    }))
  );
