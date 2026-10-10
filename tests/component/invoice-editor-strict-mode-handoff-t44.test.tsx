// @vitest-environment jsdom
// editor-ux T44 (review 2026-10-10 r2 T-m; spec.md AC-05c, AC-05d; T21 DoD; ADR-0003; T38):
//  - under React.StrictMode (mount, cleanup, mount) the editor's store still works: saving a NEW
//    invoice moves the address to /invoices/<id>/edit and leaves isSaving false;
//  - the live store of a just-created invoice is handed to the edit page's provider only for the same
//    Freelancer and the same invoice; an offer nobody takes is disposed and never adopted later; the
//    provider that adopted it disposes it when it unmounts.
// editor-ux T49 (review r3 R2, F2): the swap to the edit page goes through useRouter().replace with
// { scroll: false }, decided by "this editor started as new and its store now has an id" (not by the
// address); a store adopted under StrictMode keeps the save in flight; the focused field and its
// caret come back on the edit page's editor.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useInvoiceEditor } from '@/store/invoice-editor-store/selectors';
import { StrictMode, useEffect } from 'react';
import type { InvoiceEditorData, InvoiceBankAccount, InvoiceCustomer, InvoiceFormData } from '@/types/invoice/types';

const { updateInvoiceMock, createInvoiceMock, replaceMock } = vi.hoisted(() => ({
  updateInvoiceMock: vi.fn(),
  createInvoiceMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: replaceMock }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: updateInvoiceMock,
  createInvoice: createInvoiceMock,
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-NEXT' }),
  getInvoiceEditorData: vi.fn(),
}));

const { InvoiceEditorProvider } = await import('@/store/invoice-editor-store/invoice-editor-provider');
const { useInvoiceEditorStoreApi } = await import('@/store/invoice-editor-store/selectors');
const { renderWithEditorStore, emptyEditorData } = await import('../support/render-with-editor-store');
const { NotesSection } = await import('@/components/invoice-editor/notes-section');
const { InvoiceDetailsSection } = await import('@/components/invoice-editor/invoice-details-section');
type StoreApi = Awaited<ReturnType<typeof renderWithEditorStore>>['store'];

const sender = { id: 'sp-1', name: 'Studio', legalName: null, address: null, city: null, country: null, postalCode: null, email: null, phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 1 };
const bank: InvoiceBankAccount = { id: 'ba-1', senderProfileId: 'sp-1', bankName: 'Bank', accountName: 'Holder', accountNumber: '111', iban: null, swift: null, currency: 'USD', isDefault: true };
const customer: InvoiceCustomer = { id: 'cu-1', name: 'Customer', companyName: null, email: null, address: null, city: null, country: null, postalCode: null, phone: null, taxId: null, defaultCurrency: 'USD' };
const line = { id: 'it-1', productId: 'custom', productName: 'Work', description: '', unit: 'h', quantity: 2, price: 50, total: 100 };

/** A new invoice, filled in enough to be saved. */
function newInvoiceData(): InvoiceEditorData {
  const base = emptyEditorData();
  return {
    ...base,
    senderProfiles: [sender],
    bankAccounts: [bank],
    customers: [customer],
    initialData: { ...(base.initialData as InvoiceFormData), senderProfileId: 'sp-1', bankAccountId: 'ba-1', customerId: 'cu-1', items: [line] },
  };
}

/** What the edit page passes after the create: the server's row, without what was typed since. */
function editPageData(invoiceId = 'inv-new'): InvoiceEditorData {
  return { ...newInvoiceData(), invoiceId, version: 1, issuedDetails: null } as InvoiceEditorData;
}

const saved = {
  success: true,
  data: {
    id: 'inv-new', invoiceNumber: 'INV-0001', subtotal: 100, taxAmount: 0, total: 100, status: 'DRAFT',
    derivedOverdue: false, paidAt: null, issueDate: '2026-03-11T00:00:00.000Z', dueDate: '2026-04-10T00:00:00.000Z',
    version: 1, issuedDetails: null,
  },
};

const hold = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  updateInvoiceMock.mockReset();
  createInvoiceMock.mockReset();
  replaceMock.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('AC-05c under StrictMode: saving a new invoice', () => {
  it('moves the address to /invoices/<id>/edit and leaves isSaving false', async () => {
    window.history.replaceState(null, '', '/invoices/new');
    createInvoiceMock.mockResolvedValue(saved);
    const { store } = renderWithEditorStore(<div />, {
      initial: newInvoiceData(),
      ownerId: 'owner-strict',
      strict: true,
    });

    await act(async () => {
      await store.getState().save('save');
    });

    expect(createInvoiceMock).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/invoices/inv-new/edit');
    expect(store.getState().isSaving).toBe(false);
    expect(store.getState().invoiceId).toBe('inv-new');
    expect(store.getState().hasUnsavedChanges).toBe(false);

    // The store still works after StrictMode's extra cleanup: the next save is an update and settles.
    updateInvoiceMock.mockResolvedValue({ ...saved, data: { ...saved.data, version: 2 } });
    act(() => store.getState().updateFields({ notes: 'second' }));
    await act(async () => {
      await store.getState().save('save');
    });
    expect(updateInvoiceMock).toHaveBeenCalledTimes(1);
    expect(store.getState().isSaving).toBe(false);
  });
});

describe('T38 hand-over of a created invoice\'s live store', () => {
  function Mount({ onStore }: { onStore: (store: StoreApi) => void }) {
    const store = useInvoiceEditorStoreApi();
    useEffect(() => onStore(store), [onStore, store]);
    return null;
  }
  const provider = (key: string, ownerId: string, initial: InvoiceEditorData, api: { current: StoreApi | null }) => (
    <InvoiceEditorProvider key={key} ownerId={ownerId} initial={initial}>
      <Mount onStore={(store) => {
          api.current = store;
        }} />
    </InvoiceEditorProvider>
  );

  /** A new-invoice editor that has created its invoice and has typed since, with a save in flight. */
  async function createdAndTyping(owner: string) {
    createInvoiceMock.mockResolvedValue(saved);
    const api: { current: StoreApi | null } = { current: null };
    const view = render(provider('new', owner, newInvoiceData(), api));
    const oldStore = api.current!;
    await act(async () => {
      await oldStore.getState().save('save');
    });
    expect(oldStore.getState().invoiceId).toBe('inv-new');
    act(() => oldStore.getState().updateFields({ notes: 'typed after the create' }));
    const inFlight = hold();
    updateInvoiceMock.mockReturnValueOnce(inFlight.promise);
    act(() => {
      void oldStore.getState().save('save');
    });
    await waitFor(() => expect(oldStore.getState().isSaving).toBe(true));
    return { view, oldStore, api };
  }

  it('the edit provider of the same Freelancer and invoice adopts the live store, and the old one does not dispose it', async () => {
    const { view, oldStore, api } = await createdAndTyping('owner-1');

    view.rerender(provider('edit', 'owner-1', editPageData(), api));

    expect(api.current).toBe(oldStore);
    expect(api.current!.getState().formData.notes).toBe('typed after the create');
    // Left alone by the unmounted page: the save in flight is still the store's.
    expect(oldStore.getState().isSaving).toBe(true);

    // The adopter owns it now: unmounting it disposes the store.
    view.unmount();
    expect(oldStore.getState().isSaving).toBe(false);
  });

  it('a different Freelancer gets a fresh store from the server data, and the offered store is disposed', async () => {
    const { view, oldStore, api } = await createdAndTyping('owner-1');

    view.rerender(provider('edit', 'owner-2', editPageData(), api));

    expect(api.current).not.toBe(oldStore);
    expect(api.current!.getState().formData.notes).toBe('');
    expect(oldStore.getState().isSaving).toBe(false);
  });

  it('a different invoice id gets a fresh store too', async () => {
    const { view, oldStore, api } = await createdAndTyping('owner-1');

    view.rerender(provider('edit', 'owner-1', editPageData('inv-other'), api));

    expect(api.current).not.toBe(oldStore);
    expect(api.current!.getState().invoiceId).toBe('inv-other');
    expect(oldStore.getState().isSaving).toBe(false);
  });

  it('an offer nobody claimed is disposed on leaving and is never adopted by a later edit page', async () => {
    const { view, oldStore } = await createdAndTyping('owner-1');

    view.unmount();
    expect(oldStore.getState().isSaving).toBe(false);

    const later: { current: StoreApi | null } = { current: null };
    render(provider('edit-later', 'owner-1', editPageData(), later));
    expect(later.current).not.toBe(oldStore);
    expect(later.current!.getState().formData.notes).toBe('');
  });
});

describe('T49 the swap to the edit page after a create', () => {
  function Notes() {
    const notes = useInvoiceEditor((s) => s.formData.notes);
    const api = useInvoiceEditorStoreApi();
    return (
      <input
        aria-label="Notes"
        value={notes}
        onChange={(e) => api.getState().updateFields({ notes: e.target.value })}
      />
    );
  }
  const Capture = ({ storeRef }: { storeRef: { current: StoreApi | null } }) => {
    const store = useInvoiceEditorStoreApi();
    useEffect(() => {
      storeRef.current = store;
    }, [storeRef, store]);
    return null;
  };
  const page = (key: string, initial: InvoiceEditorData, api: { current: StoreApi | null }, strict = false) => {
    const tree = (
      <InvoiceEditorProvider key={key} ownerId="owner-t49" initial={initial}>
        <Capture storeRef={api} />
        <Notes />
      </InvoiceEditorProvider>
    );
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };

  // editor-ux T55 (review r4 P2): the move runs only from the create's own addresses. The decision
  // does not depend on whether save-command rewrote the address before or after the store's set().
  it.each([
    ['/invoices/new', 'the address is still the new-invoice page when the create resolves'],
    ['/invoices/inv-new/edit', 'the address was already rewritten to the edit page before the store update'],
  ])('asks the router to replace the address with the edit page, keeping the scroll, from %s (%s)', async (start) => {
    window.history.replaceState(null, '', start);
    createInvoiceMock.mockResolvedValue(saved);
    const api: { current: StoreApi | null } = { current: null };
    render(page('new', newInvoiceData(), api));
    await act(async () => {
      await api.current!.getState().save('save');
    });
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith('/invoices/inv-new/edit', { scroll: false });
  });

  it('does not move the router when Back took the address elsewhere while the create was in flight', async () => {
    window.history.replaceState(null, '', '/invoices/new');
    const inFlight = hold();
    createInvoiceMock.mockReturnValue(inFlight.promise);
    const api: { current: StoreApi | null } = { current: null };
    render(page('new', newInvoiceData(), api));
    let saving!: Promise<unknown>;
    act(() => {
      saving = api.current!.getState().save('save');
    });
    await waitFor(() => expect(createInvoiceMock).toHaveBeenCalledTimes(1));
    // Back: the address is now an unrelated route, as the router would leave it.
    window.history.pushState(null, '', '/dashboard');
    await act(async () => {
      inFlight.resolve(saved);
      await saving;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.location.pathname).toBe('/dashboard');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not move the router from an unrelated address even if the address was never the new page', async () => {
    window.history.replaceState(null, '', '/somewhere-else');
    createInvoiceMock.mockResolvedValue(saved);
    const api: { current: StoreApi | null } = { current: null };
    render(page('new', newInvoiceData(), api));
    await act(async () => {
      await api.current!.getState().save('save');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('a second provider mounted while a live adopter holds the claimed store does not get that store', async () => {
    createInvoiceMock.mockResolvedValue(saved);
    const api: { current: StoreApi | null } = { current: null };
    const view = render(page('new', newInvoiceData(), api));
    const oldStore = api.current!;
    await act(async () => {
      await oldStore.getState().save('save');
    });
    view.rerender(page('edit', editPageData(), api));
    expect(api.current).toBe(oldStore); // adopted: the entry is claimed, the adopter is live

    const second: { current: StoreApi | null } = { current: null };
    const other = render(page('edit-second', editPageData(), second));
    expect(second.current).not.toBe(oldStore);
    other.unmount();
    // The first adopter's store was not disposed by the second one's mount or unmount.
    expect(api.current).toBe(oldStore);
    view.unmount();
  });

  it('never moves an editor that opened an existing invoice', async () => {
    updateInvoiceMock.mockResolvedValue({ ...saved, data: { ...saved.data, version: 2 } });
    const api: { current: StoreApi | null } = { current: null };
    render(page('edit', editPageData(), api));
    await act(async () => {
      await api.current!.getState().save('save');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('under StrictMode, the adopted store keeps the save in flight: its result lands and isSaving ends false', async () => {
    createInvoiceMock.mockResolvedValue(saved);
    const api: { current: StoreApi | null } = { current: null };
    const view = render(page('new', newInvoiceData(), api, true));
    const oldStore = api.current!;
    await act(async () => {
      await oldStore.getState().save('save');
    });
    act(() => oldStore.getState().updateFields({ notes: 'typed after the create' }));
    const inFlight = hold();
    updateInvoiceMock.mockReturnValueOnce(inFlight.promise);
    act(() => {
      void oldStore.getState().save('save');
    });
    await waitFor(() => expect(oldStore.getState().isSaving).toBe(true));

    view.rerender(page('edit', editPageData(), api, true));
    expect(api.current).toBe(oldStore);

    await act(async () => {
      inFlight.resolve({ ...saved, data: { ...saved.data, version: 2 } });
      await inFlight.promise;
    });
    await waitFor(() => expect(oldStore.getState().isSaving).toBe(false));
    // The update's answer reached the store: the row's version moved on.
    expect(oldStore.getState().loadedVersion).toBe(2);
    expect(oldStore.getState().formData.notes).toBe('typed after the create');
    view.unmount();
  });

  it('puts the focus and the caret back on the same field of the edit page', async () => {
    createInvoiceMock.mockResolvedValue(saved);
    const api: { current: StoreApi | null } = { current: null };
    const view = render(page('new', newInvoiceData(), api));
    await act(async () => {
      await api.current!.getState().save('save');
    });
    act(() => api.current!.getState().updateFields({ notes: 'abcdef' }));
    const before = view.getByLabelText('Notes') as HTMLInputElement;
    before.focus();
    before.setSelectionRange(2, 4);

    view.rerender(page('edit', editPageData(), api));

    const after = view.getByLabelText('Notes') as HTMLInputElement;
    expect(after).not.toBe(before);
    expect(after.value).toBe('abcdef');
    expect(document.activeElement).toBe(after);
    expect([after.selectionStart, after.selectionEnd]).toEqual([2, 4]);
    view.unmount();
  });

  // editor-ux T54 (review r4 P1): fields named only by a useId() id, as the real sections render them.
  it('puts the focus and the caret back on the real Notes and PO number fields, whose ids change with the mount', async () => {
    const real = (key: string, initial: InvoiceEditorData, api: { current: StoreApi | null }) => (
      <InvoiceEditorProvider key={key} ownerId="owner-t54" initial={initial}>
        <Capture storeRef={api} />
        <InvoiceDetailsSection />
        <NotesSection />
      </InvoiceEditorProvider>
    );
    createInvoiceMock.mockResolvedValue(saved);
    // One hand-over per field, as in the app: a new editor creates the invoice and its edit page adopts it.
    for (const [name, caret] of [['notes', [2, 4]], ['po', [3, 5]]] as const) {
      const api: { current: StoreApi | null } = { current: null };
      const view = render(real('new', newInvoiceData(), api));
      await act(async () => {
        await api.current!.getState().save('save');
      });
      act(() => api.current!.getState().updateFields({ notes: 'abcdef', poNumber: 'PO-12345' }));
      const fieldsOf = () => ({
        notes: view.getByPlaceholderText('Additional information for the client...') as HTMLTextAreaElement,
        po: view.getByLabelText(/^PO Number/) as HTMLInputElement,
      });
      const before = fieldsOf()[name];
      const idBefore = before.id;
      before.focus();
      before.setSelectionRange(caret[0], caret[1]);

      view.rerender(real('edit', editPageData(), api));
      const after = fieldsOf()[name];
      expect(after).not.toBe(before);
      // The premise: the new mount has its own useId() ids, so an id cannot find the field again.
      expect(after.id).not.toBe(idBefore);
      expect(document.activeElement).toBe(after);
      expect([after.selectionStart, after.selectionEnd]).toEqual([...caret]);
      view.unmount();
    }
  });
});
