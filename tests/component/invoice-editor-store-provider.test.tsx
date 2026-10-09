// @vitest-environment jsdom
// editor-ux T11 (ADR-0003; spec.md §5 AC-06, AC-07): one editor store per mounted editor, built
// synchronously from the server's data and provided through context. The first render, on the server
// and in the browser, already shows the opened invoice; a key change (another invoice or another
// Freelancer) discards the store, so nothing of the previous one is ever rendered.
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useEffect, type ReactNode } from 'react';
import type { InvoiceEditorData, InvoiceFormData } from '@/types/invoice/types';

const { updateInvoiceMock } = vi.hoisted(() => ({ updateInvoiceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: updateInvoiceMock,
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-NEXT' }),
  getInvoiceEditorData: vi.fn(),
}));

import { createInvoiceEditorStore } from '@/store/invoice-editor-store/create-invoice-editor-store';
import { InvoiceEditorProvider } from '@/store/invoice-editor-store/invoice-editor-provider';
import {
  useFormData,
  useInvoiceNumber,
  useInvoiceItems,
  useSelectedCustomer,
  useSummary,
  useInvoiceEditor,
  useInvoiceEditorStoreApi,
} from '@/store/invoice-editor-store/selectors';
import { renderWithEditorStore } from '../support/render-with-editor-store';

function editorData(tag: 'A' | 'B'): InvoiceEditorData {
  const initialData: InvoiceFormData = {
    invoiceNumber: `INV-${tag}-001`,
    status: 'DRAFT',
    senderProfileId: 'sp-1',
    bankAccountId: 'ba-1',
    customerId: `cu-${tag}`,
    issueDate: new Date('2026-03-10T00:00:00.000Z'),
    dueDate: new Date('2026-03-24T00:00:00.000Z'),
    currency: 'EUR',
    poNumber: '',
    paymentTerms: 'Net 14',
    items: [
      { id: `it-${tag}`, productId: '', productName: `Line of ${tag}`, description: '', unit: 'h', quantity: 2, price: 50, total: 100 },
    ],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: '',
    terms: '',
  };
  return {
    senderProfiles: [
      { id: 'sp-1', name: 'Studio', legalName: null, address: null, city: null, country: null, postalCode: null, email: null, phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 1 },
    ],
    bankAccounts: [
      { id: 'ba-1', senderProfileId: 'sp-1', bankName: 'Bank', accountName: 'Holder', accountNumber: '111', iban: null, swift: null, currency: 'EUR', isDefault: true },
    ],
    customers: [
      { id: `cu-${tag}`, name: `Customer of ${tag}`, companyName: null, email: null, address: null, city: null, country: null, postalCode: null, phone: null, taxId: null, defaultCurrency: 'EUR' },
    ],
    products: [],
    customPrices: [],
    initialData,
    invoiceId: `inv-${tag}`,
    version: 1,
    issuedDetails: null,
  };
}

// Records what every render of the probe saw, so "first render" and "never, not even for a moment"
// are checked on the render itself and not on the settled DOM.
function makeProbe() {
  const seen: string[] = [];
  function Probe(): ReactNode {
    const number = useInvoiceNumber();
    const form = useFormData();
    const items = useInvoiceItems();
    const customer = useSelectedCustomer();
    const summary = useSummary();
    const line = `${number}|${customer?.name ?? '-'}|${items.map((i) => i.productName).join(',')}|${summary.total}|${form.currency}`;
    seen.push(line);
    return <p data-testid="probe">{line}</p>;
  }
  return { Probe, seen };
}

describe('createInvoiceEditorStore (ADR-0003)', () => {
  it('builds a store already filled from the server data, with no initialize call', () => {
    const store = createInvoiceEditorStore(editorData('A'));
    const s = store.getState();
    expect(s.formData.invoiceNumber).toBe('INV-A-001');
    expect(s.invoiceId).toBe('inv-A');
    expect(s.formData.items.map((i) => i.productName)).toEqual(['Line of A']);
    expect(s.total).toBe(100);
    expect(s.hasUnsavedChanges).toBe(false);
  });

  it('builds a new-invoice store from data without an invoice: no number, no lines, no invoice id', () => {
    const store = createInvoiceEditorStore({ ...editorData('A'), initialData: undefined, invoiceId: undefined });
    const s = store.getState();
    expect(s.invoiceId).toBeUndefined();
    expect(s.formData.invoiceNumber).toBe('');
    expect(s.formData.items).toEqual([]);
  });

  it('two stores never share state', () => {
    const a = createInvoiceEditorStore(editorData('A'));
    const b = createInvoiceEditorStore(editorData('B'));
    a.setState({ hasUnsavedChanges: true });
    expect(b.getState().hasUnsavedChanges).toBe(false);
    expect(b.getState().formData.invoiceNumber).toBe('INV-B-001');
    expect(a.getState().formData.invoiceNumber).toBe('INV-A-001');
  });

  it('a save that resolves after the editor moved to another invoice leaves the new store untouched', async () => {
    let resolveSave: (v: unknown) => void = () => {};
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolveSave = r)));
    const a = createInvoiceEditorStore(editorData('A'));
    const pending = a.getState().saveInvoice();
    const b = createInvoiceEditorStore(editorData('B'));
    const before = JSON.stringify(b.getState().formData);
    resolveSave({ success: true, data: { id: 'inv-A', invoiceNumber: 'INV-A-001', version: 2 } });
    await pending;
    expect(JSON.stringify(b.getState().formData)).toBe(before);
    expect(b.getState().invoiceId).toBe('inv-B');
  });
});

describe('InvoiceEditorProvider first render (AC-06)', () => {
  it('the server render already contains the opened invoice number, Customer, lines and total', () => {
    const { Probe } = makeProbe();
    const html = renderToString(
      <InvoiceEditorProvider initial={editorData('A')}>
        <Probe />
      </InvoiceEditorProvider>
    );
    expect(html).toContain('INV-A-001|Customer of A|Line of A|100|EUR');
  });

  it('the browser first render, before any effect or interaction, already shows the opened invoice', () => {
    const { Probe, seen } = makeProbe();
    render(
      <InvoiceEditorProvider initial={editorData('A')}>
        <Probe />
      </InvoiceEditorProvider>
    );
    expect(seen[0]).toBe('INV-A-001|Customer of A|Line of A|100|EUR');
    // nothing changes when the page becomes interactive
    expect(new Set(seen).size).toBe(1);
  });

  it('a new invoice renders its defaults from the first render and they do not change', () => {
    const { Probe, seen } = makeProbe();
    render(
      <InvoiceEditorProvider initial={{ ...editorData('A'), initialData: undefined, invoiceId: undefined }}>
        <Probe />
      </InvoiceEditorProvider>
    );
    expect(seen[0]).toMatch(/^\|-\|\|0\|/);
    expect(new Set(seen).size).toBe(1);
  });

  it('keeps the one store it created when it re-renders with other data under the same key', () => {
    const { Probe, seen } = makeProbe();
    const { rerender } = render(
      <InvoiceEditorProvider key="f1:inv-A" initial={editorData('A')}>
        <Probe />
      </InvoiceEditorProvider>
    );
    rerender(
      <InvoiceEditorProvider key="f1:inv-A" initial={editorData('B')}>
        <Probe />
      </InvoiceEditorProvider>
    );
    expect(seen.every((l) => l.startsWith('INV-A-001'))).toBe(true);
  });
});

describe('InvoiceEditorProvider isolation (AC-07)', () => {
  it('a key change to another invoice shows only the new invoice, never a frame of the old one', () => {
    const { Probe, seen } = makeProbe();
    const { rerender, getByTestId } = render(
      <InvoiceEditorProvider key="f1:inv-A" initial={editorData('A')}>
        <Probe />
      </InvoiceEditorProvider>
    );
    const framesBefore = seen.length;
    rerender(
      <InvoiceEditorProvider key="f1:inv-B" initial={editorData('B')}>
        <Probe />
      </InvoiceEditorProvider>
    );
    const after = seen.slice(framesBefore);
    expect(after.length).toBeGreaterThan(0);
    for (const frame of after) {
      expect(frame).not.toContain('INV-A');
      expect(frame).not.toContain('Customer of A');
      expect(frame).not.toContain('Line of A');
    }
    expect(getByTestId('probe').textContent).toBe('INV-B-001|Customer of B|Line of B|100|EUR');
  });

  it('a key change to another Freelancer starts a fresh store, edits of the previous one are gone', () => {
    let first: ReturnType<typeof useInvoiceEditorStoreApi> | undefined;
    let second: ReturnType<typeof useInvoiceEditorStoreApi> | undefined;
    function Grab({ slot }: { slot: 'first' | 'second' }): ReactNode {
      const api = useInvoiceEditorStoreApi();
      useEffect(() => {
        if (slot === 'first') first = api;
        else second = api;
      }, [slot, api]);
      return null;
    }
    const { rerender } = render(
      <InvoiceEditorProvider key="fa:inv-A" initial={editorData('A')}>
        <Grab slot="first" />
      </InvoiceEditorProvider>
    );
    act(() => first!.setState({ hasUnsavedChanges: true }));
    rerender(
      <InvoiceEditorProvider key="fb:new" initial={{ ...editorData('B'), initialData: undefined, invoiceId: undefined }}>
        <Grab slot="second" />
      </InvoiceEditorProvider>
    );
    expect(second).not.toBe(first);
    expect(second!.getState().hasUnsavedChanges).toBe(false);
    expect(second!.getState().invoiceId).toBeUndefined();
    expect(second!.getState().formData.invoiceNumber).toBe('');
  });

  it('two mounted editors keep separate state', () => {
    const a = renderWithEditorStore(<Slot />, { initial: editorData('A'), storeKey: 'f1:inv-A' });
    const b = renderWithEditorStore(<Slot />, { initial: editorData('B'), storeKey: 'f1:inv-B' });
    expect(a.store).not.toBe(b.store);
    act(() => a.store.setState({ hasUnsavedChanges: true }));
    expect(b.store.getState().hasUnsavedChanges).toBe(false);
    function Slot(): ReactNode {
      return null;
    }
  });
});

describe('selector hooks outside a provider', () => {
  it('throw instead of silently reading a shared module-level store', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare(): ReactNode {
      useInvoiceEditor((s) => s.formData);
      return null;
    }
    function BareNamed(): ReactNode {
      useFormData();
      return null;
    }
    function BareApi(): ReactNode {
      useInvoiceEditorStoreApi();
      return null;
    }
    expect(() => render(<Bare />)).toThrow();
    expect(() => render(<BareNamed />)).toThrow();
    expect(() => render(<BareApi />)).toThrow();
    spy.mockRestore();
  });
});

describe('renderWithEditorStore helper', () => {
  it('exposes the very store the components read', () => {
    const { Probe } = makeProbe();
    const { store, getByTestId } = renderWithEditorStore(<Probe />, { initial: editorData('A'), storeKey: 'f1:inv-A' });
    expect(store.getState().formData.invoiceNumber).toBe('INV-A-001');
    act(() => store.setState((s) => ({ formData: { ...s.formData, invoiceNumber: 'INV-EDIT' } })));
    expect(getByTestId('probe').textContent).toContain('INV-EDIT|');
  });
});
