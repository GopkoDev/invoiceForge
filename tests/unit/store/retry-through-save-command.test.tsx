// @vitest-environment jsdom
// editor-ux T14 (RED) — Retry, and the address change after a create, go through the one store save
// command (ADR-0005; spec AC-05c, AC-05d; sad §6 Flow 4). Store-level, with a fake server action and a
// captured toast so the test can press the failure message's Retry.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { InvoiceEditorData } from '@/types/invoice/types';
import type { SavedInvoice } from '@/lib/actions/invoice-actions/invoice-actions';
import { ok, fail } from '@/types/actions';

const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  getInvoiceEditorData: vi.fn(),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

type ToastOpts = { id?: string | number; action?: { label: string; onClick: () => void } };
const toastError = vi.fn<(msg: string, opts?: ToastOpts) => void>();
const toastDismiss = vi.fn<(id?: string | number) => void>();
vi.mock('sonner', () => ({
  toast: {
    error: (m: string, o?: ToastOpts) => toastError(m, o),
    success: vi.fn(),
    dismiss: (id?: string | number) => toastDismiss(id),
  },
}));

const { createInvoiceEditorStore } = await import(
  '@/store/invoice-editor-store/create-invoice-editor-store'
);
const { emptyEditorData, renderWithEditorStore } = await import(
  '../../support/render-with-editor-store'
);

type Store = ReturnType<typeof createInvoiceEditorStore>;
type Cmd = { save: (i: 'save' | 'save-and-issue') => Promise<void> };
const save = (s: Store, intent: 'save' | 'save-and-issue' = 'save') =>
  (s.getState() as unknown as Cmd).save(intent);

function pressRetry(): void {
  const call = [...toastError.mock.calls].reverse().find(([, o]) => o?.action?.label === 'Retry');
  if (!call) throw new Error('no failure message offering Retry was shown');
  call[1]!.action!.onClick();
}

const savedResult = (overrides: Partial<SavedInvoice> = {}): SavedInvoice =>
  ({
    id: 'new-9',
    invoiceNumber: 'INV-0009',
    version: 1,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    status: 'DRAFT',
    derivedOverdue: false,
    paidAt: null,
    issueDate: '2026-03-11T00:00:00.000Z',
    dueDate: '2026-04-10T00:00:00.000Z',
    issuedDetails: null,
    ...overrides,
  }) as SavedInvoice;

const FAILED = () => fail('FAILED', 'Could not reach the server.');

function newStore(): Store {
  return createInvoiceEditorStore(emptyEditorData());
}
function existingData(): InvoiceEditorData {
  return { ...emptyEditorData(), invoiceId: 'inv-1', version: 3 } as InvoiceEditorData;
}
function existingStore(): Store {
  return createInvoiceEditorStore(existingData());
}

beforeEach(() => {
  createInvoiceMock.mockReset();
  updateInvoiceMock.mockReset();
  toastError.mockReset();
  toastDismiss.mockReset();
  window.history.replaceState(null, '', '/invoices/new');
});

describe('Retry goes through the save command (AC-05c)', () => {
  it('sends the form as it is when Retry is pressed, including a change made after the failure', async () => {
    const store = newStore();
    store.getState().updateFields({ notes: 'first' });
    createInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);

    store.getState().updateFields({ notes: 'edited after the failure' });
    createInvoiceMock.mockResolvedValueOnce(ok(savedResult()));
    pressRetry();
    await vi.waitFor(() => expect(createInvoiceMock).toHaveBeenCalledTimes(2));

    expect(createInvoiceMock.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ notes: 'edited after the failure' })
    );
  });

  it('repeats Save and issue as Save and issue (status PENDING)', async () => {
    const store = existingStore();
    updateInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store, 'save-and-issue');
    updateInvoiceMock.mockResolvedValueOnce(ok(savedResult({ id: 'inv-1', status: 'PENDING' })));
    pressRetry();
    await vi.waitFor(() => expect(updateInvoiceMock).toHaveBeenCalledTimes(2));
    expect(updateInvoiceMock.mock.calls[1]![1]).toEqual(expect.objectContaining({ status: 'PENDING' }));
  });

  it('a retried create replaces the browser address with the invoice editing address, like Save', async () => {
    const store = newStore();
    createInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);
    createInvoiceMock.mockResolvedValueOnce(ok(savedResult()));
    pressRetry();
    await vi.waitFor(() => expect(store.getState().invoiceId).toBe('new-9'));
    expect(window.location.pathname).toBe('/invoices/new-9/edit');
  });

  it('Save itself changes the address inside the command, with no header hook mounted', async () => {
    const store = newStore();
    createInvoiceMock.mockResolvedValueOnce(ok(savedResult()));
    await save(store);
    expect(window.location.pathname).toBe('/invoices/new-9/edit');
  });

  it('after a retried create, the next Save updates the invoice and creates no second one', async () => {
    const store = newStore();
    createInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);
    createInvoiceMock.mockResolvedValueOnce(ok(savedResult()));
    pressRetry();
    await vi.waitFor(() => expect(store.getState().invoiceId).toBe('new-9'));
    expect(window.location.pathname).toBe('/invoices/new-9/edit');
    store.getState().updateFields({ notes: 'more' });
    updateInvoiceMock.mockResolvedValueOnce(ok(savedResult({ version: 2 })));
    await save(store);
    // the failed create and its retry; the next Save is an update, not a third create
    expect(createInvoiceMock).toHaveBeenCalledTimes(2);
    expect(updateInvoiceMock).toHaveBeenCalledWith('new-9', expect.anything());
  });

  it('a failed create leaves the address on the new-invoice page', async () => {
    const store = newStore();
    createInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);
    expect(window.location.pathname).toBe('/invoices/new');
  });
});

describe('Retry reaches the same outcome as Save (AC-05d)', () => {
  it('changed elsewhere through Retry sets the same dialog state as through Save', async () => {
    const refusal = () =>
      fail('CONFLICT', 'Changed elsewhere.', { details: { kind: 'CHANGED_ELSEWHERE' } } as never);
    const viaSave = existingStore();
    updateInvoiceMock.mockResolvedValueOnce(refusal());
    await save(viaSave);

    const viaRetry = existingStore();
    updateInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(viaRetry);
    updateInvoiceMock.mockResolvedValueOnce(refusal());
    pressRetry();
    await vi.waitFor(() => expect(viaRetry.getState().changedElsewhere).not.toBeNull());

    expect(viaRetry.getState().changedElsewhere).toBe(viaSave.getState().changedElsewhere);
    expect(viaRetry.getState().isSaving).toBe(false);
  });

  it('totals changed through Retry sets the same confirmation state as through Save', async () => {
    const answer = () =>
      fail('CONFLICT', 'Total changes.', {
        details: { kind: 'TOTALS_CHANGED', oldTotal: '10.00', newTotal: '11.00' },
      } as never);
    const viaSave = existingStore();
    updateInvoiceMock.mockResolvedValueOnce(answer());
    await save(viaSave);

    const viaRetry = existingStore();
    updateInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(viaRetry);
    updateInvoiceMock.mockResolvedValueOnce(answer());
    pressRetry();
    await vi.waitFor(() => expect(viaRetry.getState().totalsChanged).not.toBeNull());
    expect(viaRetry.getState().totalsChanged).toEqual(viaSave.getState().totalsChanged);
  });

  it('Retry while a save is running sends nothing', async () => {
    const store = existingStore();
    updateInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);
    let release!: (v: unknown) => void;
    updateInvoiceMock.mockReturnValueOnce(new Promise((r) => (release = r)));
    const running = save(store);
    pressRetry();
    expect(updateInvoiceMock).toHaveBeenCalledTimes(2);
    release(ok(savedResult({ id: 'inv-1' })));
    await running;
    expect(updateInvoiceMock).toHaveBeenCalledTimes(2);
  });

  it('Retry after the editor was left (provider unmounted) sends nothing', async () => {
    const { store, unmount } = renderWithEditorStore(<div />, { initial: existingData() });
    updateInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);
    expect(updateInvoiceMock).toHaveBeenCalledTimes(1);
    unmount();
    pressRetry();
    expect(updateInvoiceMock).toHaveBeenCalledTimes(1);
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });
  it('pressing Retry twice quickly sends one retried save', async () => {
    const store = existingStore();
    updateInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);
    updateInvoiceMock.mockReturnValueOnce(new Promise(() => {}));
    pressRetry();
    pressRetry();
    expect(updateInvoiceMock).toHaveBeenCalledTimes(2);
  });
});

describe('Leaving the editor disposes its store (review D1/S6; AC-05c, AC-05d, AC-07)', () => {
  it('a create that resolves after the editor was left does not change the browser address', async () => {
    const { store, unmount } = renderWithEditorStore(<div />);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    let release!: (v: unknown) => void;
    createInvoiceMock.mockReturnValueOnce(new Promise((r) => (release = r)));
    const running = save(store);
    unmount();
    release(ok(savedResult()));
    await running;
    expect(createInvoiceMock).toHaveBeenCalledTimes(1);
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/invoices/new');
    replaceState.mockRestore();
  });

  it('a create that resolves while the editor is shown but the page address already moved leaves the address alone', async () => {
    const { store } = renderWithEditorStore(<div />);
    let release!: (v: unknown) => void;
    createInvoiceMock.mockReturnValueOnce(new Promise((r) => (release = r)));
    const running = save(store);
    window.history.pushState(null, '', '/dashboard');
    release(ok(savedResult()));
    await running;
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('dismisses the failure message, by the id it was shown with, when the editor is left', async () => {
    const { store, unmount } = renderWithEditorStore(<div />);
    createInvoiceMock.mockResolvedValueOnce(FAILED());
    await save(store);
    const shown = toastError.mock.calls.find(([, o]) => o?.action?.label === 'Retry');
    expect(shown?.[1]?.id).toBeDefined();
    unmount();
    expect(toastDismiss).toHaveBeenCalledWith(shown![1]!.id);
  });

  it('the store exposes no way around the save command', () => {
    const state = newStore().getState() as unknown as Record<string, unknown>;
    expect(Object.keys(state)).not.toContain('setIsSaving');
    expect(Object.keys(state)).not.toContain('markAsSaved');
    expect(Object.keys(state)).not.toContain('lastFailedIntent');
  });
});
