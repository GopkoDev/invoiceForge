// editor-ux T11 (ADR-0003): the editor store is one instance per mounted editor, provided by context.
// Component tests that used to call useInvoiceEditorStore.getState()/setState() now render under the
// real provider and drive the instance through `store`, which is the same object the components read.
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import type { InvoiceEditorData } from '@/types/invoice/types';
import { InvoiceEditorProvider } from '@/store/invoice-editor-store/invoice-editor-provider';
import { useInvoiceEditorStoreApi } from '@/store/invoice-editor-store/selectors';
import type { InvoiceEditorStoreApi } from '@/store/invoice-editor-store/create-invoice-editor-store';

/** An empty editor payload: a new invoice with no sender profiles, accounts, customers or products. */
export const emptyEditorData = (): InvoiceEditorData => ({
  senderProfiles: [],
  bankAccounts: [],
  customers: [],
  products: [],
  customPrices: [],
  // Fixed days, as the server passes them: the editor never reads the clock for a new invoice.
  initialData: {
    invoiceNumber: '',
    status: 'DRAFT',
    senderProfileId: '',
    bankAccountId: '',
    customerId: '',
    issueDate: new Date('2026-03-11T00:00:00.000Z'),
    dueDate: new Date('2026-04-10T00:00:00.000Z'),
    currency: 'USD',
    poNumber: '',
    paymentTerms: '',
    items: [],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: '',
    terms: '',
  },
});

export interface RenderWithEditorStoreOptions {
  /** The server data the store is built from; defaults to emptyEditorData(). */
  initial?: InvoiceEditorData;
  /** The provider key the page would pass: `${freelancerId}:${invoiceId ?? 'new'}`. */
  storeKey?: string;
}

export type RenderWithEditorStoreResult = RenderResult & {
  /** The store instance the rendered tree reads; getState()/setState() replace the old singleton. */
  store: InvoiceEditorStoreApi;
};

export function renderWithEditorStore(
  ui: ReactElement,
  { initial = emptyEditorData(), storeKey = 'test:new' }: RenderWithEditorStoreOptions = {}
): RenderWithEditorStoreResult {
  const holder: { store: InvoiceEditorStoreApi | null } = { store: null };
  function Capture(): ReactNode {
    const api = useInvoiceEditorStoreApi();
    useEffect(() => {
      holder.store = api;
    }, [api]);
    return null;
  }
  const result = render(
    <InvoiceEditorProvider key={storeKey} initial={initial}>
      <Capture />
      {ui}
    </InvoiceEditorProvider>
  );
  if (!holder.store) throw new Error('renderWithEditorStore: the provider did not expose a store');
  return Object.assign(result, { store: holder.store });
}
