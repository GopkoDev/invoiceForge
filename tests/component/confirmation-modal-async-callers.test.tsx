// @vitest-environment jsdom
// T40 — F-40 (docs/features/architecture-hardening/_review/review-2026-09-27.md, Group 8):
// regression from the T15 async ConfirmationModal contract ("async onConfirm ⇒ caller closes",
// screens.md §New components table). ConfirmationModal itself correctly stays open while an async
// onConfirm is pending and never auto-closes it — but ProductsTable's and BankAccountsList's
// onConfirm callbacks never call confirmationModal.close() once their delete settles, so the
// dialog just sits open after a successful delete and a second click fires another delete.
//
// RED (F-40 not yet fixed): components/products/products-table.tsx:56-70 and
// components/bank-accounts/bank-accounts-list.tsx:77-90 await the delete action but never call
// confirmationModal.close() afterwards.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';

const deleteProductMock = vi.fn();
vi.mock('@/lib/actions/product-actions', () => ({
  deleteProduct: (...args: unknown[]) => deleteProductMock(...args),
  toggleProductActive: vi.fn(),
}));

const deleteBankAccountMock = vi.fn();
vi.mock('@/lib/actions/bank-account-actions', () => ({
  deleteBankAccount: (...args: unknown[]) => deleteBankAccountMock(...args),
}));

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const { ProductsTable } = await import('@/components/products/products-table');
const { ProductModalContainer } = await import(
  '@/components/modals/product/product-modal-container'
);
const { BankAccountsList } = await import(
  '@/components/bank-accounts/bank-accounts-list'
);
const { SenderProfileModalContainer } = await import(
  '@/components/modals/sender-profile/sender-profile-modal-container'
);
const { useModalStore } = await import('@/store/use-modal-store');

const product = {
  id: 'prod-1',
  userId: 'user-1',
  name: 'Widget',
  description: null,
  unit: 'pcs',
  price: 10,
  currency: 'USD' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { invoiceItems: 0, customPrices: 0 },
};

const bankAccount = {
  id: 'bank-1',
  senderProfileId: 'profile-1',
  bankName: 'First Bank',
  accountName: 'Acme',
  accountNumber: '12345',
  iban: null,
  swift: null,
  currency: 'USD' as const,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { invoices: 0 },
};

describe('ConfirmationModal async callers close the modal after settling (T40, F-40)', () => {
  beforeEach(() => {
    deleteProductMock.mockReset();
    deleteBankAccountMock.mockReset();
    routerRefresh.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    useModalStore.getState().resetAllModals();
  });

  it('closes the dialog after a successful product delete (no dialog left open for a second click)', async () => {
    const user = userEvent.setup();
    deleteProductMock.mockResolvedValue(ok());

    render(
      <>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ProductsTable products={[product as any]} />
        <ProductModalContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByText('Delete'));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteProductMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText('Delete Product')).not.toBeInTheDocument()
    );
  });

  it('closes the dialog after a failed product delete too, instead of leaving it open forever', async () => {
    const user = userEvent.setup();
    deleteProductMock.mockResolvedValue(fail('FAILED', 'Could not delete.'));

    render(
      <>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ProductsTable products={[product as any]} />
        <ProductModalContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByText('Delete'));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not delete.'));
    await waitFor(() =>
      expect(screen.queryByText('Delete Product')).not.toBeInTheDocument()
    );
  });

  it('closes the dialog after a successful bank account delete', async () => {
    const user = userEvent.setup();
    deleteBankAccountMock.mockResolvedValue(ok());

    render(
      <>
        <BankAccountsList
          senderProfileId="profile-1"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bankAccounts={[bankAccount as any]}
        />
        <SenderProfileModalContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteBankAccountMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText('Delete Bank Account')).not.toBeInTheDocument()
    );
  });
});
