// @vitest-environment jsdom
// T40 — F-41 (docs/features/architecture-hardening/_review/review-2026-09-27.md, Group 8):
// "Save" in the unsaved-changes dialog must not navigate away when the save it triggered was
// actually blocked (VALIDATION/CONFLICT fieldErrors, or a pending TOTALS_CHANGED confirmation) —
// only a save that truly went through should send the Freelancer back to the invoice list.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

const { useInvoiceEditorStore } = await import(
  '@/store/invoice-editor-store/use-invoice-editor-store'
);
const { useModalStore } = await import('@/store/use-modal-store');
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

function seedUnsavedInvoice() {
  const state = useInvoiceEditorStore.getState();
  state.initialize({
    senderProfiles: [senderProfile],
    bankAccounts: [bankAccount],
    customers: [],
    products: [],
    customPrices: [],
  });
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
}

describe('useEditorHeaderButtons — unsaved-changes dialog Save (T40, F-41)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    useModalStore.getState().resetAllModals();
    updateInvoiceMock.mockReset();
    createInvoiceMock.mockReset();
    generateInvoiceNumberMock.mockReset();
    replaceMock.mockReset();
    pushMock.mockReset();
  });

  it('does not navigate away when the triggered save comes back blocked (VALIDATION fieldErrors)', async () => {
    createInvoiceMock.mockResolvedValue(
      fail('VALIDATION', "Price can't be negative.", {
        fieldErrors: { 'items.0.price': ["Price can't be negative."] },
      })
    );

    seedUnsavedInvoice();
    const { result } = renderHook(() => useEditorHeaderButtons());

    await act(async () => {
      result.current.HomeButton.props.onClick();
    });

    const modal = useModalStore.getState().modals.unsavedChangesDialog;
    expect(modal?.open).toBe(true);

    await act(async () => {
      await modal!.onSave();
    });

    expect(createInvoiceMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('navigates to the invoice list once the triggered save actually succeeds', async () => {
    createInvoiceMock.mockResolvedValue(
      ok({
        id: 'inv-1',
        invoiceNumber: 'INV-0001',
        subtotal: 10,
        taxAmount: 0,
        total: 10,
        status: 'DRAFT' as const,
        paidAt: null,
        issueDate: '2026-10-01T00:00:00.000Z',
        dueDate: '2026-10-15T00:00:00.000Z',
      })
    );

    seedUnsavedInvoice();
    const { result } = renderHook(() => useEditorHeaderButtons());

    await act(async () => {
      result.current.HomeButton.props.onClick();
    });

    const modal = useModalStore.getState().modals.unsavedChangesDialog;
    await act(async () => {
      await modal!.onSave();
    });

    expect(pushMock).toHaveBeenCalled();
  });
});
