'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Save, Send } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useModal } from '@/store/use-modal-store';
import {
  useEditorMode,
  useHasUnsavedChanges,
  useInvoiceEditorActions,
  useInvoiceEditorStore,
  useInvoiceId,
  useIsSaving,
} from '@/store/invoice-editor-store';

export function useEditorHeaderButtons() {
  const router = useRouter();
  const unsavedChangesModal = useModal('unsavedChangesDialog');
  const confirmationModal = useModal('confirmationModal');

  const hasUnsavedChanges = useHasUnsavedChanges();
  const isSaving = useIsSaving();
  const invoiceId = useInvoiceId();
  const mode = useEditorMode();
  const { saveInvoice, clearTotalsChanged } = useInvoiceEditorActions();

  const isSaved = !hasUnsavedChanges;
  const isSavingOrPending = isSaving;

  // SCR-15: a CONFLICT TOTALS_CHANGED leaves state.totalsChanged set after saveInvoice()
  // resolves. Opens the shared, T15-extended ConfirmationModal with the old/new totals; confirm
  // resubmits with confirmedTotals and reopens itself if the resubmit comes back with fresh
  // figures (screens.md §SCR-15 "totals-changed-again"); cancel clears the pending state and
  // saves nothing (AC-17). Recurses through a ref (not itself) so the callback doesn't need to
  // reference its own not-yet-initialized binding.
  const openTotalsConfirmationRef = useRef<() => void>(() => {});

  const openTotalsConfirmation = useCallback(() => {
    const totalsChanged = useInvoiceEditorStore.getState().totalsChanged;
    if (!totalsChanged) return;

    confirmationModal.open({
      open: true,
      title: 'Confirm the new total',
      description: 'This invoice was saved before totals were recalculated.',
      body: (
        <dl className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Old total</dt>
            <dd>{totalsChanged.oldTotal}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">New total</dt>
            <dd>{totalsChanged.newTotal}</dd>
          </div>
        </dl>
      ),
      confirmText: 'Confirm and save',
      onClose: () => {
        clearTotalsChanged();
        confirmationModal.close();
      },
      onConfirm: async () => {
        const current = useInvoiceEditorStore.getState().totalsChanged;
        if (!current) {
          confirmationModal.close();
          return;
        }

        await saveInvoice({ confirmedTotals: current });

        if (useInvoiceEditorStore.getState().totalsChanged) {
          openTotalsConfirmationRef.current();
        } else {
          confirmationModal.close();
        }
      },
    });
  }, [confirmationModal, saveInvoice, clearTotalsChanged]);

  useEffect(() => {
    openTotalsConfirmationRef.current = openTotalsConfirmation;
  }, [openTotalsConfirmation]);

  const performSave = useCallback(async (options?: { issue?: boolean }) => {
    const beforeInvoiceId = invoiceId;
    await saveInvoice(options);

    if (useInvoiceEditorStore.getState().totalsChanged) {
      openTotalsConfirmation();
      return;
    }

    if (!beforeInvoiceId) {
      const newInvoiceId = useInvoiceEditorStore.getState().invoiceId;
      if (newInvoiceId) {
        const target = protectedRoutes.invoiceEdit(newInvoiceId);
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState(null, '', target);
        } else {
          router.replace(target);
        }
      }
    }
  }, [saveInvoice, invoiceId, router, openTotalsConfirmation]);

  // F-03: a flat, client-side re-run of the schema used to short-circuit Save here and open a
  // dialog listing every message, so the server's fieldErrors path (SCR-03 "validation": a
  // FieldError next to each offending field, AC-14/AC-15) was never reached. Amount rules are now
  // checked only once, server-side, in performSave -> saveInvoice; a VALIDATION/CONFLICT result
  // already lands on the store's fieldErrors (see handleSaveFailure) for the fields to render.
  const handleSave = useCallback(async (): Promise<boolean> => {
    await performSave();
    // A VALIDATION/CONFLICT failure (fieldErrors) or a pending TOTALS_CHANGED confirmation both
    // leave hasUnsavedChanges true — the caller (e.g. handleExit) must not treat those as saved.
    return !useInvoiceEditorStore.getState().hasUnsavedChanges;
  }, [performSave]);

  // invoice-integrity T16 (SCR-02): Save and issue on a saved draft — the same save, sent as PENDING.
  const handleSaveAndIssue = useCallback(async () => {
    await performSave({ issue: true });
  }, [performSave]);

  const handleExit = useCallback(() => {
    if (hasUnsavedChanges) {
      unsavedChangesModal.open({
        open: true,
        onSave: async () => {
          unsavedChangesModal.close();
          const saved = await handleSave();
          if (saved) {
            router.push(protectedRoutes.invoices);
          }
        },
        onDiscard: () => {
          unsavedChangesModal.close();
          router.push(protectedRoutes.invoices);
        },
        onCancel: unsavedChangesModal.close,
      });
    } else {
      router.push(protectedRoutes.invoices);
    }
  }, [hasUnsavedChanges, router, unsavedChangesModal, handleSave]);

  const HomeButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExit}
      className="hidden md:flex"
    >
      <ChevronLeft className="h-4 w-4" />
      Home
    </Button>
  );

  const HomeMobileButton = (
    <DropdownMenuItem onClick={handleExit}>
      <ChevronLeft className="mr-2 h-4 w-4" />
      Home
    </DropdownMenuItem>
  );

  // A cancelled invoice is read-only: no Save (SCR-02 cancelled).
  const canSave = mode !== 'cancelled';

  const SaveButton = canSave ? (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSave}
      disabled={isSavingOrPending || isSaved}
    >
      {isSavingOrPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {isSavingOrPending ? 'Saving...' : 'Save'}
    </Button>
  ) : null;

  const SaveMobileButton = canSave ? (
    <Button
      variant="outline"
      size="icon"
      onClick={handleSave}
      disabled={isSavingOrPending || isSaved}
    >
      {isSavingOrPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
    </Button>
  ) : null;

  // Only a saved draft can be issued from the editor; a new invoice always starts as a draft (AC-04b).
  const SaveAndIssueButton =
    mode === 'draft' ? (
      <Button size="sm" onClick={handleSaveAndIssue} disabled={isSavingOrPending}>
        <Send className="h-4 w-4" />
        Save and issue
      </Button>
    ) : null;

  const SaveAndIssueMobileItem =
    mode === 'draft' ? (
      <DropdownMenuItem onClick={handleSaveAndIssue} disabled={isSavingOrPending}>
        <Send className="mr-2 h-4 w-4" />
        Save and issue
      </DropdownMenuItem>
    ) : null;

  return {
    HomeButton,
    HomeMobileButton,
    SaveButton,
    SaveMobileButton,
    SaveAndIssueButton,
    SaveAndIssueMobileItem,
  };
}
