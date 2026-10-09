'use client';

import { useState, type ReactNode } from 'react';
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
  return <InvoiceEditorStoreContext.Provider value={store}>{children}</InvoiceEditorStoreContext.Provider>;
}
