// @vitest-environment jsdom
// T40 — Group 8 findings F-41 (dropped field errors), F-42 (reselect clears the number) and
// F-46 (legacy alert survives a successful save).
// See docs/features/architecture-hardening/_review/review-2026-09-27.md and
// docs/features/architecture-hardening/tasks.json (T40).
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ok, fail } from '@/types/actions';

const generateInvoiceNumberMock = vi.fn();
const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: (...args: unknown[]) => generateInvoiceNumberMock(...args),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const { useInvoiceEditorStore } = await import(
  '@/store/invoice-editor-store/use-invoice-editor-store'
);

function resetStore() {
  useInvoiceEditorStore.getState().reset();
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

describe('invoice editor store — T40 findings F-41/F-42/F-46', () => {
  beforeEach(() => {
    resetStore();
    generateInvoiceNumberMock.mockReset();
    createInvoiceMock.mockReset();
    updateInvoiceMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  // F-42 (AC-11): re-selecting the CURRENT sender profile is not a move — the invoice keeps its
  // number instead of being wiped and renumbered.
  it('F-42: keeps the invoice number when the Freelancer re-selects the already-selected sender profile', async () => {
    // A default so that IF the buggy code still calls generateInvoiceNumber for a no-op
    // reselect, the assertion below fails cleanly on the call count instead of crashing on an
    // unresolved mock return.
    generateInvoiceNumberMock.mockResolvedValue(ok('SHOULD-NOT-BE-FETCHED'));
    const state = useInvoiceEditorStore.getState();
    state.initialize({
      senderProfiles: [senderProfileA],
      bankAccounts: [bankAccountA],
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
      },
    });

    await useInvoiceEditorStore.getState().selectSenderProfile('profile-a');

    expect(generateInvoiceNumberMock).not.toHaveBeenCalled();
    expect(useInvoiceEditorStore.getState().formData.invoiceNumber).toBe('A-0007');
  });

  // F-46 (AC-17): the legacy shared-number Alert is computed from the invoice as it was
  // loaded — once the save actually succeeds (whether by changing the number or otherwise), it
  // must not keep showing a stale warning.
  it('F-46: clears the legacy flags once a save succeeds', async () => {
    updateInvoiceMock.mockResolvedValue(
      ok({
        id: 'inv-1',
        invoiceNumber: 'INV-0099',
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        status: 'DRAFT' as const,
        paidAt: null,
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
      legacy: { storedTotal: '100.00', recomputedTotal: '100.00', sharedNumber: true },
    });
    expect(useInvoiceEditorStore.getState().legacy?.sharedNumber).toBe(true);

    state.updateFields({ senderProfileId: 'profile-a', bankAccountId: 'bank-a' });
    await useInvoiceEditorStore.getState().saveInvoice();

    expect(useInvoiceEditorStore.getState().legacy).toBeNull();
  });

  // F-41 (AC-14/AC-15): a field error that has no field to render next to (e.g. an id field the
  // editor never shows an input for) must not vanish silently — the Freelancer still needs to be
  // told the save failed and why.
  it('F-41: toasts a fallback message when a fieldErrors key has no rendered field to attach to', async () => {
    createInvoiceMock.mockResolvedValue(
      fail('VALIDATION', 'Sender profile is required', {
        fieldErrors: { senderProfileId: ['Sender profile is required'] },
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

    await useInvoiceEditorStore.getState().saveInvoice();

    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('Sender profile is required')
    );
  });

  // The counterpart: a field error that DOES have a rendered field (e.g. the invoice number,
  // discount, or an item's price/quantity) must not also toast — the FieldError next to the
  // field is the only feedback, per the existing AC-08/AC-14/AC-15 tests.
  it('F-41: does not toast when every fieldErrors key already has a rendered field', async () => {
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
    state.updateFields({ invoiceNumber: 'INV-0001' });

    await useInvoiceEditorStore.getState().saveInvoice();

    expect(toastError).not.toHaveBeenCalled();
  });
});
