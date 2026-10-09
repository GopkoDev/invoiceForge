// T16 — the editor store's save-result handling: number hint/clear, fieldErrors, saved totals,
// legacy flags and the TOTALS_CHANGED confirmation state.
// See docs/features/architecture-hardening/tasks/t16-editor-number-and-save-states.md
//
// These tests exercise store/invoice-editor-store/use-invoice-editor-store.ts directly (the
// smallest unit that owns each SCR-03/SCR-15 state per the task's harness note) and mock only the
// server actions it calls. The store today has no `fieldErrors`, `totalsChanged`, `legacy` or
// `invoiceNumberHint` state, and `selectSenderProfile` fills the number field with the hint
// instead of clearing it (AC-06/AC-11 both require an *empty* field with the hint as a separate
// value) — so every assertion below is expected to fail until T16 adds that state.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { InvoiceFormData } from '@/types/invoice/types';
import type { SavedInvoice } from '@/lib/actions/invoice-actions/invoice-actions';
import { ok, fail } from '@/types/actions';

const generateInvoiceNumberMock = vi.fn();
const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: (...args: unknown[]) => generateInvoiceNumberMock(...args),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

// Imported after the mock so the store picks up the mocked actions module.
const { useInvoiceEditorStore } = await import('@/store/invoice-editor-store/use-invoice-editor-store');

function savedInvoice(overrides: Partial<SavedInvoice> = {}): SavedInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0099',
    version: 0,
    subtotal: 100,
    taxAmount: 10,
    total: 110,
    status: 'DRAFT',
    derivedOverdue: false,
    paidAt: null,
    issueDate: '2026-10-01T00:00:00.000Z',
    dueDate: '2026-10-15T00:00:00.000Z',
    issuedDetails: null,
    ...overrides,
  };
}

const senderProfileA = {
  id: 'profile-a',
  name: 'Profile A',
  legalName: null,
  address: null,
  city: null,
  country: null,
  postalCode: null,
  email: null,
  phone: null,
  taxId: null,
  logo: null,
  invoicePrefix: 'INV',
  invoiceCounter: 1,
};

const senderProfileB = { ...senderProfileA, id: 'profile-b', name: 'Profile B' };

const bankAccountA = {
  id: 'bank-a',
  senderProfileId: 'profile-a',
  bankName: 'Bank A',
  accountName: 'Account A',
  accountNumber: '111',
  iban: null,
  swift: null,
  currency: 'USD' as const,
  isDefault: true,
};

const bankAccountB = { ...bankAccountA, id: 'bank-b', senderProfileId: 'profile-b', bankName: 'Bank B' };

function resetStore() {
  useInvoiceEditorStore.getState().reset();
}

describe('invoice editor store — save states (T16)', () => {
  beforeEach(() => {
    resetStore();
    generateInvoiceNumberMock.mockReset();
    createInvoiceMock.mockReset();
    updateInvoiceMock.mockReset();
  });

  // AC-06: an empty number field is the only signal a number is system-proposed. The editor
  // shows the hint only as a hint (screens.md §SCR-03 "default-new": Input empty, hint as
  // placeholder, FieldDescription "Assigned on save") — never pre-filled into the value the
  // Freelancer would submit.
  it('AC-06: leaves the number field empty and exposes the proposed number as a separate hint when a sender profile is selected for a new invoice', async () => {
    generateInvoiceNumberMock.mockResolvedValue(ok('INV-0100'));

    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
      customers: [],
      products: [],
      customPrices: [],
    });

    await useInvoiceEditorStore.getState().selectSenderProfile('profile-a');

    const after = useInvoiceEditorStore.getState();
    expect(after.formData.invoiceNumber).toBe('');
    expect(after.invoiceNumberHint).toBe('INV-0100');
  });

  // AC-06 / AC-13: on success the final number and the server's recomputed totals replace
  // whatever the browser had, and any prior field error is cleared.
  it('AC-06/AC-13: on successful create, replaces the number and totals with the SavedInvoice figures', async () => {
    createInvoiceMock.mockResolvedValue(
      ok(savedInvoice({ invoiceNumber: 'INV-0101', subtotal: 42.42, taxAmount: 4.24, total: 46.66 }))
    );

    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
      customers: [],
      products: [],
      customPrices: [],
    });
    // The browser's own (possibly different) computed total before saving.
    state.updateFields({
      senderProfileId: 'profile-a',
      bankAccountId: 'bank-a',
      items: [
        { id: 'item-1', productId: 'custom', productName: 'Item', description: '', unit: 'pcs', quantity: 1, price: 9.99, total: 9.99 },
      ],
    });

    await useInvoiceEditorStore.getState().saveInvoice();

    const after = useInvoiceEditorStore.getState();
    expect(after.formData.invoiceNumber).toBe('INV-0101');
    expect(after.total).toBe(46.66);
    expect(after.subtotal).toBe(42.42);
    expect(after.taxAmount).toBe(4.24);
    expect(after.fieldErrors).toBeUndefined();
  });

  // AC-08: a CONFLICT on the number blocks the save and surfaces the contract's verbatim
  // message under the number field; other values are kept, sequence untouched (no re-fetch).
  it('AC-08: exposes the CONFLICT fieldErrors.invoiceNumber message when the typed number is already used', async () => {
    const message = 'This invoice number is already used in this sender profile.';
    createInvoiceMock.mockResolvedValue(
      fail('CONFLICT', message, { fieldErrors: { invoiceNumber: [message] } })
    );

    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
      customers: [],
      products: [],
      customPrices: [],
    });
    state.updateFields({ invoiceNumber: 'INV-0001', senderProfileId: 'profile-a', bankAccountId: 'bank-a' });

    await useInvoiceEditorStore.getState().saveInvoice();

    const after = useInvoiceEditorStore.getState();
    expect(after.fieldErrors?.invoiceNumber).toEqual([message]);
    // The save was blocked: the manually typed number the Freelancer entered is kept.
    expect(after.formData.invoiceNumber).toBe('INV-0001');
  });

  // AC-14/AC-15: VALIDATION fieldErrors map onto the same keys the form uses
  // (items.<i>.price, discount, ...), values kept.
  it('AC-14/AC-15: exposes VALIDATION fieldErrors keyed by the contract paths', async () => {
    createInvoiceMock.mockResolvedValue(
      fail('VALIDATION', 'Invalid amounts.', {
        fieldErrors: {
          'items.0.price': ["Price can't be negative."],
          discount: ["Discount can't exceed the subtotal plus shipping."],
        },
      })
    );

    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
      customers: [],
      products: [],
      customPrices: [],
    });
    state.updateFields({
      senderProfileId: 'profile-a',
      bankAccountId: 'bank-a',
      discount: 99999,
      items: [
        { id: 'item-1', productId: 'custom', productName: 'Item', description: '', unit: 'pcs', quantity: 1, price: -5, total: -5 },
      ],
    });

    await useInvoiceEditorStore.getState().saveInvoice();

    const after = useInvoiceEditorStore.getState();
    expect(after.fieldErrors?.['items.0.price']).toEqual(["Price can't be negative."]);
    expect(after.fieldErrors?.discount).toEqual(["Discount can't exceed the subtotal plus shipping."]);
    // Entered (invalid) values are kept, not reverted.
    expect(after.formData.discount).toBe(99999);
    expect(after.formData.items[0].price).toBe(-5);
  });

  // AC-11: moving an existing invoice's sender profile clears the number field and applies the
  // same "empty = hint only" rule under the new profile; the old profile's number is not
  // proposed again.
  it('AC-11: clears the number field and fetches the new profile hint when moving an existing invoice', async () => {
    generateInvoiceNumberMock.mockResolvedValue(ok('B-0001'));

    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA, senderProfileB],
      bankAccounts: [bankAccountA, bankAccountB],
      customers: [],
      products: [],
      customPrices: [],
      invoiceId: 'existing-invoice',
      initialData: {
        invoiceNumber: 'A-0007',
        status: 'DRAFT',
        senderProfileId: 'profile-a',
        bankAccountId: 'bank-a',
        customerId: '',
        issueDate: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        currency: 'USD',
        poNumber: '',
        paymentTerms: '',
        items: [],
        taxRate: 0,
        discount: 0,
        shipping: 0,
        notes: '',
        terms: '',
      } satisfies InvoiceFormData,
    });

    await useInvoiceEditorStore.getState().selectSenderProfile('profile-b');

    const after = useInvoiceEditorStore.getState();
    expect(after.formData.invoiceNumber).toBe('');
    expect(after.invoiceNumberHint).toBe('B-0001');
  });

  // AC-17: legacy flags from getInvoiceEditorData land in the store on initialize, so the editor
  // can show the SCR-03 "legacy-shared-number" Alert.
  it('AC-17: carries legacy.sharedNumber from initialize into store state', () => {
    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
      customers: [],
      products: [],
      customPrices: [],
      invoiceId: 'legacy-invoice',
      legacy: { storedTotal: '100.00', recomputedTotal: '100.00', sharedNumber: true },
    });

    expect(useInvoiceEditorStore.getState().legacy).toEqual({
      storedTotal: '100.00',
      recomputedTotal: '100.00',
      sharedNumber: true,
    });
  });

  // AC-24 (F-01, T26): the editor holds the stored status, so a save never sends the derived
  // overdue back; the header badge reads the separate derivedOverdue flag, refreshed by each save.
  it('AC-24: keeps the stored status in formData and shows the derived overdue badge beside it', async () => {
    updateInvoiceMock.mockResolvedValue(ok(savedInvoice({ status: 'PENDING', derivedOverdue: false })));
    useInvoiceEditorStore.getState().initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
      customers: [],
      products: [],
      customPrices: [],
      invoiceId: 'late-invoice',
      derivedOverdue: true,
      initialData: {
        invoiceNumber: 'A-0007',
        status: 'PENDING',
        senderProfileId: 'profile-a',
        bankAccountId: 'bank-a',
        customerId: '',
        issueDate: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        currency: 'USD',
        poNumber: '',
        paymentTerms: '',
        items: [],
        taxRate: 0,
        discount: 0,
        shipping: 0,
        notes: '',
        terms: '',
      } satisfies InvoiceFormData,
    });

    const loaded = useInvoiceEditorStore.getState();
    expect(loaded.formData.status).toBe('PENDING');
    expect(loaded.derivedOverdue).toBe(true);

    await loaded.saveInvoice();

    expect(updateInvoiceMock).toHaveBeenCalledWith(
      'late-invoice',
      expect.objectContaining({ status: 'PENDING' })
    );
    const saved = useInvoiceEditorStore.getState();
    expect(saved.formData.status).toBe('PENDING');
    expect(saved.derivedOverdue).toBe(false);
  });

  // AC-17 (SCR-15): a CONFLICT with details.kind === 'TOTALS_CHANGED' surfaces the old/new
  // totals so the header can open the confirmation dialog, and a confirmed resubmit sends
  // confirmedTotals back through to updateInvoice.
  it('AC-17: exposes totalsChanged on CONFLICT TOTALS_CHANGED, and resubmits with confirmedTotals', async () => {
    updateInvoiceMock.mockResolvedValueOnce(
      fail('CONFLICT', 'The total of this invoice changes from 120.00 to 119.99. Confirm to save.', {
        details: { kind: 'TOTALS_CHANGED', oldTotal: '120.00', newTotal: '119.99' },
      })
    );

    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
      customers: [],
      products: [],
      customPrices: [],
      invoiceId: 'legacy-invoice',
    });
    state.updateFields({ senderProfileId: 'profile-a', bankAccountId: 'bank-a' });

    await useInvoiceEditorStore.getState().saveInvoice();

    const afterConflict = useInvoiceEditorStore.getState();
    expect(afterConflict.totalsChanged).toEqual({ oldTotal: '120.00', newTotal: '119.99' });

    updateInvoiceMock.mockResolvedValueOnce(ok(savedInvoice({ total: 119.99 })));

    await useInvoiceEditorStore
      .getState()
      .saveInvoice({ confirmedTotals: { oldTotal: '120.00', newTotal: '119.99' } });

    expect(updateInvoiceMock).toHaveBeenLastCalledWith(
      'legacy-invoice',
      expect.objectContaining({ confirmedTotals: { oldTotal: '120.00', newTotal: '119.99' } })
    );
    expect(useInvoiceEditorStore.getState().totalsChanged).toBeNull();
  });
});
