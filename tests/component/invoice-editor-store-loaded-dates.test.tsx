// T44 (r3 I-01) — the editor remembers the stored issue/due instants it was built from and sends
// them with an update, then replaces them with the stored dates the save returns.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { InvoiceFormData } from '@/types/invoice/types';
import type { SavedInvoice } from '@/lib/actions/invoice-actions/invoice-actions';
import { ok } from '@/types/actions';

const generateInvoiceNumberMock = vi.fn();
const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: (...args: unknown[]) => generateInvoiceNumberMock(...args),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastErrorMock(...a), success: vi.fn() },
}));

const goToSignInMock = vi.fn();
vi.mock('@/lib/helpers/client-session-redirect', async (orig) => {
  const actual = await orig<typeof import('@/lib/helpers/client-session-redirect')>();
  return {
    ...actual,
    goToSignIn: () => goToSignInMock(),
    redirectIfUnauthorized: (r: { success: false; code?: string }) => {
      if (r.code === 'UNAUTHORIZED') {
        goToSignInMock();
        return true;
      }
      return false;
    },
  };
});

const { createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store');
const { emptyEditorData } = await import('../support/render-with-editor-store');
let store: ReturnType<typeof createInvoiceEditorStore>;
const emptyData = { senderProfiles: [], bankAccounts: [], customers: [], products: [], customPrices: [], initialData: emptyEditorData().initialData };

const LEGACY_ISSUE = '2026-09-30T21:00:00.000Z';
const LEGACY_DUE = '2026-10-14T21:00:00.000Z';

function initialData(): InvoiceFormData {
  return {
    invoiceNumber: 'INV-0001',
    status: 'PENDING',
    senderProfileId: 'profile-a',
    bankAccountId: 'bank-a',
    customerId: 'customer-a',
    // As the server hands them over: stored instants (serialised Dates).
    issueDate: new Date(LEGACY_ISSUE),
    dueDate: new Date(LEGACY_DUE),
    currency: 'USD',
    poNumber: '',
    paymentTerms: '',
    items: [],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: '',
    terms: '',
  } as InvoiceFormData;
}

function saved(overrides: Partial<SavedInvoice> = {}): SavedInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    version: 0,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    status: 'PENDING',
    derivedOverdue: false,
    paidAt: null,
    issueDate: '2026-10-01T00:00:00.000Z',
    dueDate: '2026-10-15T00:00:00.000Z',
    issuedDetails: null,
    ...overrides,
  };
}

const base = { senderProfiles: [], bankAccounts: [], customers: [], products: [], customPrices: [], initialData: emptyEditorData().initialData };

describe('invoice editor store - loaded dates (T44)', () => {
  beforeEach(() => {
    store = createInvoiceEditorStore(emptyData);
    createInvoiceMock.mockReset();
    updateInvoiceMock.mockReset();
    generateInvoiceNumberMock.mockReset();
    goToSignInMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('an update sends the stored instants the editor was built from next to the submitted days', async () => {
    updateInvoiceMock.mockResolvedValue(ok(saved()));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    await store.getState().save('save');

    const [id, payload] = updateInvoiceMock.mock.calls[0];
    expect(id).toBe('inv-1');
    expect(payload).toMatchObject({
      issueDate: '2026-09-30',
      dueDate: '2026-10-14',
      loadedIssueDate: LEGACY_ISSUE,
      loadedDueDate: LEGACY_DUE,
    });
  });

  it('a new invoice sends no loaded dates', async () => {
    createInvoiceMock.mockResolvedValue(ok(saved()));
    store = createInvoiceEditorStore({ ...base });

    await store.getState().save('save');

    const [payload] = createInvoiceMock.mock.calls[0];
    expect(payload).not.toHaveProperty('loadedIssueDate');
    expect(payload).not.toHaveProperty('loadedDueDate');
  });

  it('after a save the form shows the stored days and the next save sends the stored instants, not the first snapshot', async () => {
    updateInvoiceMock.mockResolvedValue(ok(saved()));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    await store.getState().save('save');
    const after = store.getState();
    expect(after.formData.dueDate.getDate()).toBe(15);
    expect(after.formData.issueDate.getDate()).toBe(1);

    await store.getState().save('save');
    const [, second] = updateInvoiceMock.mock.calls[1];
    expect(second).toMatchObject({
      issueDate: '2026-10-01',
      dueDate: '2026-10-15',
      loadedIssueDate: '2026-10-01T00:00:00.000Z',
      loadedDueDate: '2026-10-15T00:00:00.000Z',
    });
  });

  it('a date picked while the save is in flight survives the response and keeps the form dirty', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = store.getState().save('save');
    store.getState().updateField('dueDate', new Date(2026, 9, 20));
    resolve(ok(saved()));
    await saving;

    const after = store.getState();
    expect(after.formData.dueDate.getDate()).toBe(20);
    // The untouched issue date still takes the stored day.
    expect(after.formData.issueDate.getDate()).toBe(1);
    expect(after.hasUnsavedChanges).toBe(true);
  });

  it('an invoice number or status changed while the save is in flight survives the response and keeps the form dirty (K-02)', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = store.getState().save('save');
    store.getState().updateField('invoiceNumber', 'INV-0042');
    store.getState().updateField('status', 'PAID');
    resolve(ok(saved({ invoiceNumber: 'INV-0001', status: 'PENDING' })));
    await saving;

    const after = store.getState();
    expect(after.formData.invoiceNumber).toBe('INV-0042');
    expect(after.formData.status).toBe('PAID');
    expect(after.hasUnsavedChanges).toBe(true);
  });

  it('a save that resolves after reset() and initialize() writes nothing into the new session (K-01)', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = store.getState().save('save');
    store.getState().initialize(emptyData);
    store.getState().initialize({ ...base });
    resolve(ok(saved({ id: 'inv-A', invoiceNumber: 'INV-A' })));
    await saving;

    const after = store.getState();
    expect(after.invoiceId).toBeUndefined();
    expect(after.formData.invoiceNumber).toBe('');
    expect(after.loadedDates).toBeNull();
  });

  it('a failure that arrives after reset() shows no field errors in the new session (K-01)', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = store.getState().save('save');
    store.getState().initialize(emptyData);
    store.getState().initialize({ ...base });
    resolve({ success: false, code: 'VALIDATION', error: 'bad', fieldErrors: { invoiceNumber: ['taken'] } });
    await saving;

    expect(store.getState().fieldErrors).toBeUndefined();
  });

  it('a failure that arrives after reset() still toasts, without Retry and without writing state (M-02)', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = store.getState().save('save');
    store.getState().initialize(emptyData);
    store.getState().initialize({ ...base });
    resolve({ success: false, code: 'FAILED', error: 'db down' });
    await saving;

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('db down');
    expect(store.getState().fieldErrors).toBeUndefined();
  });

  it('a save of A resolving after reset()/initialize()/save of B leaves isSaving true (M-03)', async () => {
    let resolveA!: (value: unknown) => void;
    let resolveB!: (value: unknown) => void;
    updateInvoiceMock
      .mockReturnValueOnce(new Promise((r) => (resolveA = r)))
      .mockReturnValueOnce(new Promise((r) => (resolveB = r)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });
    const savingA = store.getState().save('save');
    store.getState().initialize(emptyData);
    store.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-2' });
    const savingB = store.getState().save('save');

    resolveA(ok(saved({ id: 'inv-1' })));
    await savingA;
    expect(store.getState().isSaving).toBe(true);

    resolveB(ok(saved({ id: 'inv-2' })));
    await savingB;
    expect(store.getState().isSaving).toBe(false);
  });

  it('an empty number stays empty when the sender profile was switched while the save was in flight (L-02)', async () => {
    let resolve!: (value: unknown) => void;
    createInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    store = createInvoiceEditorStore({ ...base, initialData: { ...initialData(), invoiceNumber: '' } });

    generateInvoiceNumberMock.mockResolvedValue(ok('B-0001'));

    const saving = store.getState().save('save');
    await store.getState().selectSenderProfile('profile-b');
    resolve(ok(saved({ invoiceNumber: 'A-0005' })));
    await saving;

    const after = store.getState();
    expect(after.formData.senderProfileId).toBe('profile-b');
    expect(after.formData.invoiceNumber).toBe('');
    expect(after.invoiceNumberHint).toBe('B-0001');
    expect(goToSignInMock).not.toHaveBeenCalled();
  });

  it('a sender hint that resolves after reset() is not written (M-04a)', async () => {
    let resolve!: (value: unknown) => void;
    generateInvoiceNumberMock.mockReturnValue(new Promise((r) => (resolve = r)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData() });

    const selecting = store.getState().selectSenderProfile('profile-b');
    store.getState().initialize(emptyData);
    // N-01: a new session whose sender is the same one the stale pick chose.
    store.getState().initialize({
      ...base,
      initialData: { ...initialData(), senderProfileId: 'profile-b', invoiceNumber: '' },
    });
    resolve(ok('B-0001'));
    await selecting;

    expect(store.getState().invoiceNumberHint).toBeUndefined();
  });

  it("an earlier sender's hint that resolves after a later pick is not written (M-04a)", async () => {
    let resolveB!: (value: unknown) => void;
    generateInvoiceNumberMock
      .mockReturnValueOnce(new Promise((r) => (resolveB = r)))
      .mockResolvedValueOnce(ok('C-0001'));
    store = createInvoiceEditorStore({ ...base, initialData: initialData() });

    const pickingB = store.getState().selectSenderProfile('profile-b');
    await store.getState().selectSenderProfile('profile-c');
    resolveB(ok('B-0001'));
    await pickingB;

    expect(store.getState().formData.senderProfileId).toBe('profile-c');
    expect(store.getState().invoiceNumberHint).toBe('C-0001');
  });

  it('the Retry action of a stale session does nothing (M-04b)', async () => {
    updateInvoiceMock.mockResolvedValue({ success: false, code: 'FAILED', error: 'db down' });
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });
    await store.getState().save('save');
    const retry = toastErrorMock.mock.calls[0][1].action.onClick as () => void;

    store.getState().initialize(emptyData);
    store.getState().initialize({ ...base });
    retry();

    expect(updateInvoiceMock).toHaveBeenCalledTimes(1);
    expect(createInvoiceMock).not.toHaveBeenCalled();
    expect(store.getState().isSaving).toBe(false);
  });

  it('the Retry action of a live session saves again (N-03)', async () => {
    updateInvoiceMock.mockResolvedValue({ success: false, code: 'FAILED', error: 'db down' });
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });
    await store.getState().save('save');
    const retry = toastErrorMock.mock.calls[0][1].action.onClick as () => void;

    retry();
    await vi.waitFor(() => expect(updateInvoiceMock).toHaveBeenCalledTimes(2));
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });

  it('the Retry action does nothing while another save is in flight (N-02)', async () => {
    updateInvoiceMock
      .mockResolvedValueOnce({ success: false, code: 'FAILED', error: 'db down' })
      .mockReturnValueOnce(new Promise(() => {}));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });
    await store.getState().save('save');
    const retry = toastErrorMock.mock.calls[0][1].action.onClick as () => void;

    void store.getState().save('save');
    expect(store.getState().isSaving).toBe(true);
    expect(updateInvoiceMock).toHaveBeenCalledTimes(2);

    retry();
    await Promise.resolve();

    expect(updateInvoiceMock).toHaveBeenCalledTimes(2);
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });

  it('a stale UNAUTHORIZED and a stale rejection both still send the device to sign-in (architecture-hardening AC-21)', async () => {
    for (const settle of [
      (r: (v: unknown) => void) => r({ success: false, code: 'UNAUTHORIZED', error: 'no' }),
      (_r: (v: unknown) => void, j: (e: unknown) => void) => j(new Error('boom')),
    ]) {
      goToSignInMock.mockReset();
      let res!: (v: unknown) => void;
      let rej!: (e: unknown) => void;
      updateInvoiceMock.mockReturnValue(new Promise((a, b) => ((res = a), (rej = b))));
      store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

      const saving = store.getState().save('save');
      store.getState().initialize(emptyData);
      settle(res, rej);
      await saving;

      expect(goToSignInMock).toHaveBeenCalledTimes(1);
    }
  });

  // T45 (review r2): a rejected number-hint call is treated like UNAUTHORIZED, as selectSenderProfile does.
  it('T45: a rejected number-hint request sends the device to sign-in', async () => {
    generateInvoiceNumberMock.mockRejectedValue(new Error('boom'));
    store = createInvoiceEditorStore({
      ...base,
      initialData: { ...initialData(), invoiceNumber: '' },
    });
    expect(store.getState().hintStatus).toBe('loading');

    await store.getState().requestNumberHint();

    expect(goToSignInMock).toHaveBeenCalledTimes(1);
  });

  // T45 (review r2): dispose() while a save is in flight must not leave isSaving stuck for a reused store.
  it('T45: a save in flight when the store is disposed ends with isSaving false, and the store can save again', async () => {
    let res!: (v: unknown) => void;
    updateInvoiceMock.mockReturnValueOnce(new Promise((a) => (res = a)));
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = store.getState().save('save');
    expect(store.getState().isSaving).toBe(true);
    store.getState().dispose();
    res(ok(saved()));
    await saving;

    expect(store.getState().isSaving).toBe(false);

    updateInvoiceMock.mockResolvedValue(ok(saved()));
    await store.getState().save('save');
    expect(updateInvoiceMock).toHaveBeenCalledTimes(2);
  });

  it('reset forgets the loaded dates', () => {
    store = createInvoiceEditorStore({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    store.getState().initialize(emptyData);

    expect(store.getState().loadedDates).toBeNull();
  });
});
