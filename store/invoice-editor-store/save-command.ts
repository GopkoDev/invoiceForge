'use client';

import { toast } from 'sonner';
import type { InvoiceFormData } from '@/types/invoice/types';
import type { ActionFailure } from '@/types/actions';
import { protectedRoutes } from '@/config/routes.config';
import { goToSignIn, redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';
import {
  createInvoice,
  updateInvoice,
  type SavedInvoice,
} from '@/lib/actions/invoice-actions/invoice-actions';
import { localDateToDay, storedDayToLocalDate } from '@/lib/helpers/calendar-day';
import { recalculateComputedValues, toSavePayload } from './helpers';
import type { InvoiceEditorState, SaveIntent, SaveOptions } from './types';

// editor-ux T13 (ADR-0005): the one command every save goes through. It reads the form and its
// revision when called, sends it, and resolves every outcome itself.

/** The form fields an issued invoice still lets the Freelancer change. */
const ISSUED_EDITABLE_KEYS = ['dueDate', 'notes', 'paymentTerms', 'poNumber'] as const;

export const ISSUED_EDITS_DROPPED_NOTICE =
  'Your latest changes were not saved because the invoice is now issued. Its lines are locked as they were issued.';

// F-41: the field-error keys the editor actually renders a FieldError next to
// (invoice-details-section.tsx, summary-section.tsx, invoice-item-fields.tsx). A key outside this
// set has nowhere on screen to appear, so it is toasted as a fallback instead of dropped silently.
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

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Api {
  get: () => InvoiceEditorState;
  set: (partial: Partial<InvoiceEditorState>) => void;
  /** Changes on every initialize() and dispose(); a result for an older session is dropped. */
  sessionToken: () => number;
  /** The Retry failure message: shown with this id, so the store can dismiss it when disposed. */
  failureToast: { id: string; shown: boolean };
}

export function createSaveCommand({ get, set, sessionToken, failureToast }: Api) {
  function handleSaveFailure(
    result: ActionFailure,
    intent: SaveIntent,
    token: number
  ): void {
    // architecture-hardening AC-21: a stale session's save sends the device to sign-in. The
    // signed-out state is global, so this runs before the session check.
    if (redirectIfUnauthorized(result)) return;

    // A save that failed after the editor was re-initialized or left still tells the user it was not
    // stored, but writes no state and offers no Retry (the form it would resubmit is gone).
    if (token !== sessionToken()) {
      toast.error(result.error || 'Error saving invoice.');
      return;
    }

    if (result.details?.kind === 'CHANGED_ELSEWHERE') {
      set({ changedElsewhere: result.error });
      return;
    }

    if (result.details?.kind === 'TOTALS_CHANGED') {
      // The refused save stored nothing: the form stays unsaved until the totals are confirmed.
      set({
        totalsChanged: { oldTotal: result.details.oldTotal, newTotal: result.details.newTotal },
        hasUnsavedChanges: true,
      });
      return;
    }

    if (result.details?.kind === 'STATUS_NOT_ALLOWED') {
      toast.error(result.error);
      return;
    }

    if (result.details?.kind === 'ISSUED_INVOICE_LOCKED') {
      set({ lockedRefusal: result.error });
    }

    if (result.fieldErrors) {
      set({ fieldErrors: result.fieldErrors });
      const unrendered = Object.entries(result.fieldErrors).filter(
        ([key]) => !isRenderedFieldErrorKey(key)
      );
      if (unrendered.length > 0) {
        toast.error(unrendered.flatMap(([, messages]) => messages).join(' '));
      }
      return;
    }

    if (result.code === 'FAILED') {
      failureToast.shown = true;
      toast.error(result.error || 'Error saving invoice.', {
        id: failureToast.id,
        action: {
          label: 'Retry',
          onClick: () => {
            // A Retry clicked after the editor was re-initialized or left would save another form; one clicked while a
            // save is running would be a second save (a duplicate create). Retry repeats the intent
            // with the form as it is now; confirmed totals are not carried over (AC-05c/05d: a
            // changed total is asked about again, as Save does).
            if (token === sessionToken() && !get().isSaving) void get().save(intent);
          },
        },
      });
      return;
    }

    toast.error(result.error || 'Error saving invoice.');
  }

  // A saved result. `submitted` is the form the save was built from and `revision` the form's
  // revision then: if the form has not been edited since, the server's figures replace the browser's
  // (architecture-hardening AC-06, AC-13). Otherwise only the new version, id and number are
  // applied, the form stays as typed and unsaved, and the totals are recomputed from the lines on
  // screen (editor-ux AC-03, AC-04) — never the stored figures of an older form.
  function applySavedInvoice(
    saved: SavedInvoice,
    submitted: InvoiceFormData,
    revision: number,
    token: number
  ): void {
    if (token !== sessionToken()) return;
    const state = get();
    const untouched = state.revision === revision;
    const nowIssued = saved.status !== 'DRAFT';

    // The invoice became issued under an edit: the lines stay as issued and only the fields an
    // issued invoice allows keep their later edits (AC-05b).
    const droppedByIssue = !untouched && nowIssued && state.storedStatus === 'DRAFT';
    const form: InvoiceFormData = droppedByIssue
      ? {
          ...submitted,
          ...Object.fromEntries(ISSUED_EDITABLE_KEYS.map((key) => [key, state.formData[key]])),
        }
      : state.formData;
    const allowedEdited = ISSUED_EDITABLE_KEYS.some(
      (key) => !sameValue(state.formData[key], submitted[key])
    );
    const lockedEdited = (Object.keys(submitted) as Array<keyof InvoiceFormData>).some(
      (key) =>
        !(ISSUED_EDITABLE_KEYS as readonly string[]).includes(key) &&
        !sameValue(state.formData[key], submitted[key])
    );

    const storedOrEdited = (key: 'issueDate' | 'dueDate', stored: string): Date =>
      localDateToDay(form[key]) === localDateToDay(submitted[key])
        ? storedDayToLocalDate(stored)
        : form[key];
    // Switching the sender profile mid-save clears the number on purpose, so it counts as an edit.
    const senderSwitched = form.senderProfileId !== submitted.senderProfileId;
    const storedUnlessEdited = <K extends 'invoiceNumber' | 'status'>(
      key: K,
      stored: InvoiceFormData[K]
    ): InvoiceFormData[K] =>
      form[key] === submitted[key] && !(key === 'invoiceNumber' && senderSwitched)
        ? stored
        : form[key];

    const formData: InvoiceFormData = {
      ...form,
      invoiceNumber: storedUnlessEdited('invoiceNumber', saved.invoiceNumber),
      status: storedUnlessEdited('status', saved.status),
      // The row's stored dates (a kept legacy / normalised value may differ from the submitted day).
      issueDate: storedOrEdited('issueDate', saved.issueDate),
      dueDate: storedOrEdited('dueDate', saved.dueDate),
    };
    const figures = untouched
      ? { subtotal: saved.subtotal, taxAmount: saved.taxAmount, total: saved.total }
      : (({ subtotal, taxAmount, total }) => ({ subtotal, taxAmount, total }))(
          recalculateComputedValues({ ...state, formData })
        );

    set({
      formData,
      ...figures,
      derivedOverdue: saved.derivedOverdue,
      invoiceId: saved.id,
      // The mode follows what the row holds now: a draft issued by Save and issue turns issued.
      storedStatus: saved.status,
      // What the server froze in this save (null for a draft): the issued blocks and PDF show it.
      issuedDetails: saved.issuedDetails,
      // The row's version now: the next save's loadedVersion (ADR-0004).
      loadedVersion: saved.version,
      fieldErrors: undefined,
      totalsChanged: null,
      hasUnsavedChanges: untouched ? false : droppedByIssue ? allowedEdited : true,
      issuedEditsDroppedNotice:
        droppedByIssue && lockedEdited ? ISSUED_EDITS_DROPPED_NOTICE : state.issuedEditsDroppedNotice,
      // F-46: the legacy shared-number Alert is stale once a save succeeds.
      legacy: null,
      // What the row holds now: the next save compares its days against these.
      loadedDates: { issueDate: saved.issueDate, dueDate: saved.dueDate },
    });
  }

  async function save(intent: SaveIntent, opts?: SaveOptions): Promise<void> {
    // One save at a time: a second submit while one runs would be a duplicate create.
    if (get().isSaving) return;
    const state = get();
    const token = sessionToken();
    const submitted = state.formData;
    const revision = state.revision;
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
      intent === 'save-and-issue' ? { ...submitted, status: 'PENDING' } : submitted,
      opts?.confirmedTotals,
      state.loadedDates,
      state.loadedVersion
    );

    try {
      if (state.invoiceId) {
        const result = await updateInvoice(state.invoiceId, payload);
        if (result.success) {
          applySavedInvoice(result.data, submitted, revision, token);
          toast.success(intent === 'save-and-issue' ? 'Invoice issued' : 'Invoice updated');
        } else {
          handleSaveFailure(result, intent, token);
        }
      } else {
        const result = await createInvoice(payload);
        if (result.success) {
          applySavedInvoice(result.data, submitted, revision, token);
          // The invoice now has its own editing address: a reload opens it and the next save updates
          // it. The native history API keeps Next's router in sync without remounting the page. Only
          // while this editor is still the page shown: after leaving, the address is not ours.
          if (
            token === sessionToken() &&
            typeof window !== 'undefined' &&
            window.location.pathname === protectedRoutes.invoicesNew
          ) {
            window.history.replaceState(null, '', protectedRoutes.invoiceEdit(result.data.id));
          }
          toast.success('Invoice created');
        } else {
          handleSaveFailure(result, intent, token);
        }
      }
    } catch {
      // architecture-hardening AC-21: a rejected save is treated like UNAUTHORIZED.
      goToSignIn();
    } finally {
      // A re-initialize already cleared isSaving for the session that owns the store now; a
      // disposed store has no screen left to show it.
      if (token === sessionToken()) set({ isSaving: false });
    }
  }

  return { save };
}
