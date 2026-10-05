// T44 (r3 I-01) — the editor remembers the stored issue/due instants it was built from and sends
// them with an update, then replaces them with the stored dates the save returns.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { InvoiceFormData } from '@/types/invoice/types';
import type { SavedInvoice } from '@/lib/actions/invoice-actions/invoice-actions';
import { ok } from '@/types/actions';

const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
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

const { useInvoiceEditorStore } = await import('@/store/invoice-editor-store/use-invoice-editor-store');

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
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    status: 'PENDING',
    derivedOverdue: false,
    paidAt: null,
    issueDate: '2026-10-01T00:00:00.000Z',
    dueDate: '2026-10-15T00:00:00.000Z',
    ...overrides,
  };
}

const base = { senderProfiles: [], bankAccounts: [], customers: [], products: [], customPrices: [] };

describe('invoice editor store - loaded dates (T44)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    createInvoiceMock.mockReset();
    updateInvoiceMock.mockReset();
    goToSignInMock.mockReset();
  });

  it('an update sends the stored instants the editor was built from next to the submitted days', async () => {
    updateInvoiceMock.mockResolvedValue(ok(saved()));
    useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    await useInvoiceEditorStore.getState().saveInvoice();

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
    useInvoiceEditorStore.getState().initialize({ ...base });

    await useInvoiceEditorStore.getState().saveInvoice();

    const [payload] = createInvoiceMock.mock.calls[0];
    expect(payload).not.toHaveProperty('loadedIssueDate');
    expect(payload).not.toHaveProperty('loadedDueDate');
  });

  it('after a save the form shows the stored days and the next save sends the stored instants, not the first snapshot', async () => {
    updateInvoiceMock.mockResolvedValue(ok(saved()));
    useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    await useInvoiceEditorStore.getState().saveInvoice();
    const after = useInvoiceEditorStore.getState();
    expect(after.formData.dueDate.getDate()).toBe(15);
    expect(after.formData.issueDate.getDate()).toBe(1);

    await useInvoiceEditorStore.getState().saveInvoice();
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
    useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = useInvoiceEditorStore.getState().saveInvoice();
    useInvoiceEditorStore.getState().updateField('dueDate', new Date(2026, 9, 20));
    resolve(ok(saved()));
    await saving;

    const after = useInvoiceEditorStore.getState();
    expect(after.formData.dueDate.getDate()).toBe(20);
    // The untouched issue date still takes the stored day.
    expect(after.formData.issueDate.getDate()).toBe(1);
    expect(after.hasUnsavedChanges).toBe(true);
  });

  it('an invoice number or status changed while the save is in flight survives the response and keeps the form dirty (K-02)', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = useInvoiceEditorStore.getState().saveInvoice();
    useInvoiceEditorStore.getState().updateField('invoiceNumber', 'INV-0042');
    useInvoiceEditorStore.getState().updateField('status', 'PAID');
    resolve(ok(saved({ invoiceNumber: 'INV-0001', status: 'PENDING' })));
    await saving;

    const after = useInvoiceEditorStore.getState();
    expect(after.formData.invoiceNumber).toBe('INV-0042');
    expect(after.formData.status).toBe('PAID');
    expect(after.hasUnsavedChanges).toBe(true);
  });

  it('a save that resolves after reset() and initialize() writes nothing into the new session (K-01)', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = useInvoiceEditorStore.getState().saveInvoice();
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.getState().initialize({ ...base });
    resolve(ok(saved({ id: 'inv-A', invoiceNumber: 'INV-A' })));
    await saving;

    const after = useInvoiceEditorStore.getState();
    expect(after.invoiceId).toBeUndefined();
    expect(after.formData.invoiceNumber).toBe('');
    expect(after.loadedDates).toBeNull();
  });

  it('a failure that arrives after reset() shows no field errors in the new session (K-01)', async () => {
    let resolve!: (value: unknown) => void;
    updateInvoiceMock.mockReturnValue(new Promise((r) => (resolve = r)));
    useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    const saving = useInvoiceEditorStore.getState().saveInvoice();
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.getState().initialize({ ...base });
    resolve({ success: false, code: 'VALIDATION', error: 'bad', fieldErrors: { invoiceNumber: ['taken'] } });
    await saving;

    expect(useInvoiceEditorStore.getState().fieldErrors).toBeUndefined();
  });

  it('a stale UNAUTHORIZED and a stale rejection both still send the device to sign-in (AC-21)', async () => {
    for (const settle of [
      (r: (v: unknown) => void) => r({ success: false, code: 'UNAUTHORIZED', error: 'no' }),
      (_r: (v: unknown) => void, j: (e: unknown) => void) => j(new Error('boom')),
    ]) {
      goToSignInMock.mockReset();
      let res!: (v: unknown) => void;
      let rej!: (e: unknown) => void;
      updateInvoiceMock.mockReturnValue(new Promise((a, b) => ((res = a), (rej = b))));
      useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

      const saving = useInvoiceEditorStore.getState().saveInvoice();
      useInvoiceEditorStore.getState().reset();
      settle(res, rej);
      await saving;

      expect(goToSignInMock).toHaveBeenCalledTimes(1);
    }
  });

  it('reset forgets the loaded dates', () => {
    useInvoiceEditorStore.getState().initialize({ ...base, initialData: initialData(), invoiceId: 'inv-1' });

    useInvoiceEditorStore.getState().reset();

    expect(useInvoiceEditorStore.getState().loadedDates).toBeNull();
  });
});
