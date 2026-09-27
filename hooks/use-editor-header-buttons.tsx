'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Save } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useModal } from '@/store/use-modal-store';
import {
  useHasUnsavedChanges,
  useInvalidItems,
  useInvoiceEditorActions,
  useInvoiceEditorStore,
  useInvoiceId,
  useIsSaving,
} from '@/store/invoice-editor-store';
import { getValidItems } from '@/lib/helpers/invoice-editor';

export function useEditorHeaderButtons() {
  const router = useRouter();
  const unsavedChangesModal = useModal('unsavedChangesDialog');
  const invalidItemsWarningModal = useModal('invalidItemsWarningDialog');
  const confirmationModal = useModal('confirmationModal');

  const hasUnsavedChanges = useHasUnsavedChanges();
  const isSaving = useIsSaving();
  const invoiceId = useInvoiceId();
  const invalidItems = useInvalidItems();
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

  const performSave = useCallback(async () => {
    const state = useInvoiceEditorStore.getState();

    if (invalidItems.length > 0) {
      const validItems = getValidItems(state.formData.items, invalidItems);
      state.updateFields({ items: validItems });
    }

    const beforeInvoiceId = invoiceId;
    await saveInvoice();

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
  }, [saveInvoice, invoiceId, router, invalidItems, openTotalsConfirmation]);

  // F-03: a flat, client-side re-run of the schema used to short-circuit Save here and open a
  // dialog listing every message, so the server's fieldErrors path (SCR-03 "validation": a
  // FieldError next to each offending field, AC-14/AC-15) was never reached. Amount rules are now
  // checked only once, server-side, in performSave -> saveInvoice; a VALIDATION/CONFLICT result
  // already lands on the store's fieldErrors (see handleSaveFailure) for the fields to render.
  const handleSave = useCallback(async (): Promise<boolean> => {
    return await new Promise<boolean>(async (resolve) => {
      if (invalidItems.length > 0) {
        invalidItemsWarningModal.open({
          open: true,
          invalidItems,
          onConfirm: async () => {
            invalidItemsWarningModal.close();
            await performSave();
            resolve(!useInvoiceEditorStore.getState().hasUnsavedChanges);
          },
          onCancel: () => {
            invalidItemsWarningModal.close();
            resolve(false);
          },
        });
        return;
      }

      await performSave();
      // A VALIDATION/CONFLICT failure (fieldErrors) or a pending TOTALS_CHANGED confirmation
      // both leave hasUnsavedChanges true — the caller (e.g. handleExit) must not treat those as
      // saved.
      resolve(!useInvoiceEditorStore.getState().hasUnsavedChanges);
    });
  }, [invalidItems, performSave, invalidItemsWarningModal]);

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

  const SaveButton = (
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
  );

  const SaveMobileButton = (
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
  );

  return { HomeButton, HomeMobileButton, SaveButton, SaveMobileButton };
}
