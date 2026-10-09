'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Save, Send } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useModal } from '@/store/use-modal-store';
import type { SaveIntent } from '@/store/invoice-editor-store';
import {
  useEditorMode,
  useHasUnsavedChanges,
  useInvoiceEditorActions,
  useInvoiceEditorStoreApi,
  useIsSaving,
} from '@/store/invoice-editor-store';

export function useEditorHeaderButtons() {
  const router = useRouter();
  const editorStore = useInvoiceEditorStoreApi();
  const unsavedChangesModal = useModal('unsavedChangesDialog');

  const hasUnsavedChanges = useHasUnsavedChanges();
  const isSaving = useIsSaving();
  const mode = useEditorMode();
  const { save } = useInvoiceEditorActions();

  const isSaved = !hasUnsavedChanges;
  const isSavingOrPending = isSaving;

  // Every outcome of a save (the address after a create, the changed-elsewhere and totals dialogs)
  // is resolved by the store's save command and shown by the editor's modal container (ADR-0005).
  const performSave = useCallback(
    async (intent: SaveIntent = 'save') => {
      await save(intent);
    },
    [save]
  );

  // F-03: a flat, client-side re-run of the schema used to short-circuit Save here and open a
  // dialog listing every message, so the server's fieldErrors path (SCR-03 "validation": a
  // FieldError next to each offending field, AC-14/AC-15) was never reached. Amount rules are now
  // checked only once, server-side, in performSave -> save; a VALIDATION/CONFLICT result
  // already lands on the store's fieldErrors (see handleSaveFailure) for the fields to render.
  const handleSave = useCallback(async (): Promise<boolean> => {
    await performSave();
    // A VALIDATION/CONFLICT failure (fieldErrors) or a pending TOTALS_CHANGED confirmation both
    // leave hasUnsavedChanges true — the caller (e.g. handleExit) must not treat those as saved.
    return !editorStore.getState().hasUnsavedChanges;
  }, [performSave, editorStore]);

  // invoice-integrity T16 (SCR-02): Save and issue on a saved draft — the same save, sent as PENDING.
  const handleSaveAndIssue = useCallback(async () => {
    await performSave('save-and-issue');
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
