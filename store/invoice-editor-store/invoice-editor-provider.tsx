'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { InvoiceEditorData } from '@/types/invoice/types';
import type { InvoiceEditorInitData } from './types';
import { createInvoiceEditorStore } from './create-invoice-editor-store';
import { InvoiceEditorStoreContext } from './selectors';

/**
 * Creates the editor's store once per mount, from the server's data (ADR-0003). Pages pass
 * key={`${freelancerId}:${invoiceId ?? 'new'}`} so React discards the store when the invoice or the
 * account changes.
 */
export function InvoiceEditorProvider({
  initial,
  children,
}: {
  initial: InvoiceEditorInitData | InvoiceEditorData;
  children: ReactNode;
}) {
  const [store] = useState(() => createInvoiceEditorStore(initial));
  // Leaving the editor disposes its store, so a Retry or a create finishing later cannot act on
  // another page. The cleanup is all there is to arm: dispose() only invalidates what started
  // before it, so StrictMode's mount, cleanup, mount leaves the store working for new saves.
  useEffect(() => () => store.getState().dispose(), [store]);
  return <InvoiceEditorStoreContext.Provider value={store}>{children}</InvoiceEditorStoreContext.Provider>;
}
