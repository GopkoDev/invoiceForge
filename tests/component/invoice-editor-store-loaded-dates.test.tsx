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
});
