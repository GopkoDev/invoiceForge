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

const { useInvoiceEditorStore } = await import('@/store/invoice-editor-store/use-invoice-editor-store');
const { createInitialFormData } = await import('@/store/invoice-editor-store/helpers');

const ORIGINAL_TZ = process.env.TZ;
const SAVED = { id: 'inv-1', invoiceNumber: 'INV-1', subtotal: 0, taxAmount: 0, total: 0, status: 'DRAFT', paidAt: null };

const emptyData = {
  senderProfiles: [],
  bankAccounts: [],
  customers: [],
  products: [],
  customPrices: [],
};

/** A saved invoice as the server sends it: its days at UTC midnight. */
function storedForm(issue: string, due: string): InvoiceFormData {
  return {
    ...createInitialFormData(),
    issueDate: new Date(`${issue}T00:00:00.000Z`),
    dueDate: new Date(`${due}T00:00:00.000Z`),
  };
}

/** The Calendar picks: local Dates at local midnight. */
function pickDays(issueDate: Date, dueDate: Date) {
  useInvoiceEditorStore.getState().updateFields({ issueDate, dueDate });
}

describe('invoice editor store — calendar days (T25)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
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
      useInvoiceEditorStore.getState().initialize({ ...emptyData });
      pickDays(new Date(2026, 9, 1), new Date(2026, 9, 15));
      await useInvoiceEditorStore.getState().saveInvoice();
      expect(createInvoiceMock).toHaveBeenCalledTimes(1);
      const payload = createInvoiceMock.mock.calls[0][0];
      expect(payload.issueDate).toBe('2026-10-01');
      expect(payload.dueDate).toBe('2026-10-15');
    },
  );

  it('updateInvoice receives days too', async () => {
    process.env.TZ = 'Europe/Kyiv';
    useInvoiceEditorStore.getState().initialize({
      ...emptyData,
      invoiceId: 'inv-1',
      initialData: storedForm('2026-09-01', '2026-09-20'),
    });
    pickDays(new Date(2026, 9, 1), new Date(2026, 9, 15));
    await useInvoiceEditorStore.getState().saveInvoice();
    expect(updateInvoiceMock).toHaveBeenCalledWith('inv-1', expect.objectContaining({ issueDate: '2026-10-01', dueDate: '2026-10-15' }));
  });

  it.each(['Europe/Kyiv', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'a stored day (UTC midnight) loads into the editor as the same Y/M/D in %s',
    (zone) => {
      process.env.TZ = zone;
      useInvoiceEditorStore.getState().initialize({
        ...emptyData,
        invoiceId: 'inv-1',
        initialData: storedForm('2026-10-01', '2026-10-15'),
      });
      const { issueDate, dueDate } = useInvoiceEditorStore.getState().formData;
      expect([issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate()]).toEqual([2026, 9, 1]);
      expect([dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()]).toEqual([2026, 9, 15]);
    },
  );

  it('a loaded day saves back as the same day (no drift on an edit-and-save)', async () => {
    process.env.TZ = 'America/Los_Angeles';
    useInvoiceEditorStore.getState().initialize({
      ...emptyData,
      invoiceId: 'inv-1',
      initialData: storedForm('2026-10-01', '2026-10-15'),
    });
    await useInvoiceEditorStore.getState().saveInvoice();
    expect(updateInvoiceMock).toHaveBeenCalledWith('inv-1', expect.objectContaining({ issueDate: '2026-10-01', dueDate: '2026-10-15' }));
  });

  it('the new-invoice defaults are today and 30 calendar days later, as local days', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      process.env.TZ = 'America/Los_Angeles';
      vi.setSystemTime(new Date('2026-12-15T03:00:00Z')); // 19:00 on 14 Dec in Los Angeles
      const { issueDate, dueDate } = createInitialFormData();
      expect([issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate()]).toEqual([2026, 11, 14]);
      expect([dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()]).toEqual([2027, 0, 13]);
    } finally {
      vi.useRealTimers();
    }
  });
});
