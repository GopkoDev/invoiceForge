// T25 (spec.md §1 "a due date is a calendar day … without any shift", §5 AC-12, AC-23b;
// review-2026-10-05 F-02) — the editor sends the picked day as `yyyy-MM-dd` (never the Calendar's
// local-midnight instant), and a stored UTC-midnight day comes back as the same Y/M/D in any zone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceFormData } from '@/types/invoice/types';
import { ok } from '@/types/actions';

const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

const { createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store');
let store: ReturnType<typeof createInvoiceEditorStore>;
const { emptyEditorData } = await import('../support/render-with-editor-store');

const ORIGINAL_TZ = process.env.TZ;
const SAVED = { id: 'inv-1', invoiceNumber: 'INV-1', subtotal: 0, taxAmount: 0, total: 0, status: 'DRAFT', paidAt: null, issueDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-15T00:00:00.000Z' };

const emptyData = {
  senderProfiles: [],
  bankAccounts: [],
  customers: [],
  products: [],
  customPrices: [],
  initialData: emptyEditorData().initialData,
};

/** A saved invoice as the server sends it: its days at UTC midnight. */
function storedForm(issue: string, due: string): InvoiceFormData {
  return {
    ...emptyEditorData().initialData!,
    issueDate: new Date(`${issue}T00:00:00.000Z`),
    dueDate: new Date(`${due}T00:00:00.000Z`),
  };
}

/** The Calendar picks: local Dates at local midnight. */
function pickDays(issueDate: Date, dueDate: Date) {
  store.getState().updateFields({ issueDate, dueDate });
}

describe('invoice editor store — calendar days (T25)', () => {
  beforeEach(() => {
    store = createInvoiceEditorStore(emptyData);
    createInvoiceMock.mockReset();
    updateInvoiceMock.mockReset();
    createInvoiceMock.mockResolvedValue(ok(SAVED));
    updateInvoiceMock.mockResolvedValue(ok(SAVED));
  });

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it.each(['Europe/Kyiv', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'createInvoice receives the day picked as local midnight in %s as yyyy-MM-dd',
    async (zone) => {
      process.env.TZ = zone;
      store = createInvoiceEditorStore({ ...emptyData });
      pickDays(new Date(2026, 9, 1), new Date(2026, 9, 15));
      await store.getState().saveInvoice();
      expect(createInvoiceMock).toHaveBeenCalledTimes(1);
      const payload = createInvoiceMock.mock.calls[0][0];
      expect(payload.issueDate).toBe('2026-10-01');
      expect(payload.dueDate).toBe('2026-10-15');
    },
  );

  it('updateInvoice receives days too', async () => {
    process.env.TZ = 'Europe/Kyiv';
    store = createInvoiceEditorStore({
      ...emptyData,
      invoiceId: 'inv-1',
      initialData: storedForm('2026-09-01', '2026-09-20'),
    });
    pickDays(new Date(2026, 9, 1), new Date(2026, 9, 15));
    await store.getState().saveInvoice();
    expect(updateInvoiceMock).toHaveBeenCalledWith('inv-1', expect.objectContaining({ issueDate: '2026-10-01', dueDate: '2026-10-15' }));
  });

  it.each(['Europe/Kyiv', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'a stored day (UTC midnight) loads into the editor as the same Y/M/D in %s',
    (zone) => {
      process.env.TZ = zone;
      store.getState().initialize({
        ...emptyData,
        invoiceId: 'inv-1',
        initialData: storedForm('2026-10-01', '2026-10-15'),
      });
      const { issueDate, dueDate } = store.getState().formData;
      expect([issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate()]).toEqual([2026, 9, 1]);
      expect([dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()]).toEqual([2026, 9, 15]);
    },
  );

  it('a loaded day saves back as the same day (no drift on an edit-and-save)', async () => {
    process.env.TZ = 'America/Los_Angeles';
    store = createInvoiceEditorStore({
      ...emptyData,
      invoiceId: 'inv-1',
      initialData: storedForm('2026-10-01', '2026-10-15'),
    });
    await store.getState().saveInvoice();
    expect(updateInvoiceMock).toHaveBeenCalledWith('inv-1', expect.objectContaining({ issueDate: '2026-10-01', dueDate: '2026-10-15' }));
  });
});
