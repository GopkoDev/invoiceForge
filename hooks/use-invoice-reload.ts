'use client';

// invoice-integrity T18 (screens.md SCR-05 reloading/reloaded/reload-not-found/reload-error): Reload re-fetches
// the editor data and re-initialises the editor from the current invoice, in its current status's
// mode. A re-initialised editor has no unsaved changes, so the unsaved-changes guard never fires. An
// invoice deleted elsewhere refreshes into the edit page's not-found (SCR-13); a failed fetch leaves
// the store's reloadFailed set for the load error (SCR-17).
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useInvoiceEditorActions } from '@/store/invoice-editor-store';

export function useInvoiceReload() {
  const router = useRouter();
  const { reloadInvoice } = useInvoiceEditorActions();

  return useCallback(async () => {
    const outcome = await reloadInvoice();
    if (outcome === 'not-found') router.refresh();
    return outcome;
  }, [reloadInvoice, router]);
}
