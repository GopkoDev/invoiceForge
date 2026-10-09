// @vitest-environment jsdom
// T16 — SCR-15: a save that returns CONFLICT TOTALS_CHANGED opens the extended ConfirmationModal
// (T15) via store/use-modal-store.ts with the old/new totals, and confirming resubmits
// saveInvoice with confirmedTotals; cancelling clears the store's totalsChanged.
// See docs/features/architecture-hardening/tasks/t16-editor-number-and-save-states.md
//
// useEditorHeaderButtons today calls save('save') once inside performSave and never looks at
// state.totalsChanged afterwards, so no confirmationModal is ever opened — this assertion is
// expected to fail until T16 adds the SCR-15 wiring.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';
import type { InvoiceSenderProfile, InvoiceBankAccount } from '@/types/invoice/types';

const updateInvoiceMock = vi.fn();
const createInvoiceMock = vi.fn();
const generateInvoiceNumberMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: (...args: unknown[]) => generateInvoiceNumberMock(...args),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

// Imported after the mocks so both the store and the hook pick up the mocked actions module.
const { createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store');
const { emptyEditorData } = await import('../support/render-with-editor-store');
const { withEditorStore } = await import('../support/editor-store-wrapper');
let store: ReturnType<typeof createInvoiceEditorStore> = createInvoiceEditorStore(emptyEditorData());
const { useModalStore } = await import('@/store/use-modal-store');
const { InvoiceEditorModalContainer } = await import(
  '@/components/modals/invoice-editor/invoice-editor-modal-container'
);
const { useEditorHeaderButtons } = await import('@/hooks/use-editor-header-buttons');

const senderProfile: InvoiceSenderProfile = {
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

const bankAccount: InvoiceBankAccount = {
  id: 'bank-a',
  senderProfileId: 'profile-a',
  bankName: 'Bank A',
  accountName: 'Account A',
  accountNumber: '111',
  iban: null,
  swift: null,
  currency: 'USD',
  isDefault: true,
};

describe('useEditorHeaderButtons — SCR-15 totals confirmation (T16)', () => {
  beforeEach(() => {
    store = createInvoiceEditorStore(emptyEditorData());
    useModalStore.getState().resetAllModals();
    updateInvoiceMock.mockReset();
    createInvoiceMock.mockReset();
    generateInvoiceNumberMock.mockReset();
    replaceMock.mockReset();
    pushMock.mockReset();
  });

  it('shows the confirmation with the old/new totals on CONFLICT TOTALS_CHANGED, and resubmits with confirmedTotals on confirm', async () => {
    updateInvoiceMock.mockResolvedValueOnce(
      fail(
        'CONFLICT',
        'The total of this invoice changes from 120.00 to 119.99. Confirm to save.',
        { details: { kind: 'TOTALS_CHANGED', oldTotal: '120.00', newTotal: '119.99' } }
      )
    );

    store = createInvoiceEditorStore({
      senderProfiles: [senderProfile],
      bankAccounts: [bankAccount],
      customers: [],
      products: [],
      customPrices: [],
      initialData: emptyEditorData().initialData,
      invoiceId: 'legacy-invoice',
    });
    const state = store.getState();
    state.updateFields({
      senderProfileId: 'profile-a',
      bankAccountId: 'bank-a',
      customerId: 'customer-a',
      items: [
        {
          id: 'item-1',
          productId: 'custom',
          productName: 'Item',
          description: '',
          unit: 'pcs',
          quantity: 1,
          price: 10,
          total: 10,
        },
      ],
    });

    // editor-ux T14: the dialog is shown by the editor's modal container from the store's state.
    const Provide = withEditorStore(store);
    const { result } = renderHook(() => useEditorHeaderButtons(), {
      wrapper: ({ children }) => (
        <Provide>
          {children}
          <InvoiceEditorModalContainer />
        </Provide>
      ),
    });

    await act(async () => {
      await result.current.SaveButton!.props.onClick();
    });

    expect(await screen.findByText('Confirm the new total')).toBeTruthy();
    expect(screen.getByText('120.00')).toBeTruthy();
    expect(screen.getByText('119.99')).toBeTruthy();

    updateInvoiceMock.mockResolvedValueOnce(
      ok({
        id: 'legacy-invoice',
        invoiceNumber: 'INV-0099',
        subtotal: 10,
        taxAmount: 0,
        total: 10,
        status: 'DRAFT' as const,
        paidAt: null,
        issueDate: '2026-10-01T00:00:00.000Z',
        dueDate: '2026-10-15T00:00:00.000Z',
      })
    );

    await userEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await waitFor(() => expect(store.getState().isSaving).toBe(false));

    expect(updateInvoiceMock).toHaveBeenLastCalledWith(
      'legacy-invoice',
      expect.objectContaining({ confirmedTotals: { oldTotal: '120.00', newTotal: '119.99' } })
    );
    expect(store.getState().totalsChanged).toBeNull();
  });
});
