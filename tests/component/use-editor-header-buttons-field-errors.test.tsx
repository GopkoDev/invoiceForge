// @vitest-environment jsdom
// T32 — F-03 (docs/features/architecture-hardening/_review/review-2026-09-27.md, Group 1):
// handleSave ran the client-side schema (validateInvoiceForm) and, on any issue, opened the flat
// validationErrorDialog — the save action was never called, so the server's fieldErrors path
// (SCR-03 "validation": a FieldError next to each offending field, AC-14/AC-15) was never
// reached from the Save button.
//
// RED (F-03 not yet fixed): hooks/use-editor-header-buttons.tsx's handleSave short-circuits on
// `validateInvoiceForm(state.formData).length > 0` by opening `validationErrorDialog` and
// resolving without ever calling saveInvoice, so `updateInvoiceMock` below is never invoked and
// `fieldErrors` on the store is never populated.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { fail } from '@/types/actions';
import type { InvoiceSenderProfile, InvoiceBankAccount } from '@/types/invoice/types';

const updateInvoiceMock = vi.fn();
const createInvoiceMock = vi.fn();
const generateInvoiceNumberMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: (...args: unknown[]) => generateInvoiceNumberMock(...args),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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

describe('useEditorHeaderButtons — Save reaches server fieldErrors (F-03, AC-14/AC-15)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    useModalStore.getState().resetAllModals();
    updateInvoiceMock.mockReset();
    createInvoiceMock.mockReset();
    generateInvoiceNumberMock.mockReset();
  });

  it('a negative price still submits to the server and lands the returned fieldErrors on the store instead of opening the flat validation dialog', async () => {
    createInvoiceMock.mockResolvedValueOnce(
      fail('VALIDATION', "Price can't be negative.", {
        fieldErrors: { 'items.0.price': ["Price can't be negative."] },
      })
    );

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
          price: -5,
          total: -5,
        },
      ],
    });

    const { result } = renderHook(() => useEditorHeaderButtons());

    // Fired without awaiting completion: today's buggy handleSave opens a modal and its returned
    // promise only resolves once that dialog is closed by a user click, which this test never
    // does. Flushing one microtask tick is enough to observe whether the save actually reached
    // the server.
    act(() => {
      void result.current.SaveButton!.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(createInvoiceMock).toHaveBeenCalledTimes(1);
    expect(useInvoiceEditorStore.getState().fieldErrors).toEqual({
      'items.0.price': ["Price can't be negative."],
    });
    expect(useModalStore.getState().modals.validationErrorDialog?.open).toBeFalsy();
  });
});
