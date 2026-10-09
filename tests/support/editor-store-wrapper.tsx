// editor-ux T11 (ADR-0003): for tests that prepare state on a store *before* rendering, which
// renderWithEditorStore cannot do (it builds the store from `initial` at render time). The wrapper
// provides an existing store instance to the rendered tree through the same context the provider uses.
import type { ReactNode } from 'react';
import { InvoiceEditorStoreContext } from '@/store/invoice-editor-store/selectors';
import type { InvoiceEditorStoreApi } from '@/store/invoice-editor-store/create-invoice-editor-store';

export function withEditorStore(store: InvoiceEditorStoreApi) {
  return function EditorStoreWrapper({ children }: { children: ReactNode }) {
    return <InvoiceEditorStoreContext.Provider value={store}>{children}</InvoiceEditorStoreContext.Provider>;
  };
}
