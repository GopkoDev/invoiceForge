// @vitest-environment jsdom
// T42 (review-2026-09-28 N-06, N-13; AC-21): products, bank accounts, custom prices and profile
// route UNAUTHORIZED to sign-in, and a rejected confirmed delete clears the caller's busy state.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';

const deleteProductMock = vi.fn();
const toggleProductMock = vi.fn();
vi.mock('@/lib/actions/product-actions', () => ({
  deleteProduct: (...a: unknown[]) => deleteProductMock(...a),
  toggleProductActive: (...a: unknown[]) => toggleProductMock(...a),
  getProducts: vi.fn(),
}));

const deleteBankMock = vi.fn();
vi.mock('@/lib/actions/bank-account-actions', () => ({
  deleteBankAccount: (...a: unknown[]) => deleteBankMock(...a),
}));

const deleteCustomPriceMock = vi.fn();
vi.mock('@/lib/actions/custom-price-actions', () => ({
  deleteCustomPrice: (...a: unknown[]) => deleteCustomPriceMock(...a),
}));

const updateProfileMock = vi.fn();
vi.mock('@/lib/actions/profile-actions', () => ({
  updateProfile: (...a: unknown[]) => updateProfileMock(...a),
}));

vi.mock('@/lib/actions/customer-actions', () => ({ getCustomers: vi.fn() }));

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

const { ProductsTable } = await import('@/components/products/products-table');
const { BankAccountsList } =
  await import('@/components/bank-accounts/bank-accounts-list');
const { CustomerCustomPrices } =
  await import('@/components/customers/customer-custom-prices');
const { ProductCustomPrices } =
  await import('@/components/products/product-custom-prices');
const { ProfileSettings } =
  await import('@/components/settings/profile-settings');
const { ProductModalContainer } =
  await import('@/components/modals/product/product-modal-container');
const { SenderProfileModalContainer } =
  await import('@/components/modals/sender-profile/sender-profile-modal-container');
const { CustomerModalContainer } =
  await import('@/components/modals/customer/customer-modal-container');
const { SettingsModalContainer } =
  await import('@/components/modals/settings/settings-modal-container');
const { useModalStore } = await import('@/store/use-modal-store');

const assignMock = vi.fn();
const SIGN_IN = '/api/auth/clear-session';
const unauthorized = () => fail('UNAUTHORIZED', 'Not signed in.');

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

const customPrice = {
  id: 'cp-1',
  productId: 'prod-1',
  customerId: 'cust-1',
  name: null,
  price: 8,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  product: {
    id: 'prod-1',
    name: 'Widget',
    price: 10,
    currency: 'USD' as const,
    unit: 'pcs',
    isActive: true,
  },
  customer: { id: 'cust-1', name: 'Acme Co', companyName: null },
};

beforeEach(() => {
  for (const m of [
    deleteProductMock,
    toggleProductMock,
    deleteBankMock,
    deleteCustomPriceMock,
    updateProfileMock,
    toastError,
    assignMock,
  ]) {
    m.mockReset();
  }
  useModalStore.getState().resetAllModals();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignMock },
    writable: true,
  });
});

describe('products table (T42)', () => {
  const renderTable = () =>
    render(
      <>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ProductsTable products={[product as any]} />
        <ProductModalContainer />
      </>
    );

  it('N-06: toggle active UNAUTHORIZED routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    toggleProductMock.mockResolvedValue(unauthorized());
    renderTable();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByText('Deactivate'));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-06: delete UNAUTHORIZED routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    deleteProductMock.mockResolvedValue(unauthorized());
    renderTable();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByText('Delete'));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-13: a rejected delete routes to sign-in and clears the busy state', async () => {
    const user = userEvent.setup();
    deleteProductMock.mockRejectedValue(new Error('401'));
    renderTable();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByText('Delete'));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open menu', hidden: true })
      ).toBeEnabled()
    );
  });
});

describe('bank accounts list (T42)', () => {
  const renderList = () =>
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

  it('N-06: delete UNAUTHORIZED routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    deleteBankMock.mockResolvedValue(unauthorized());
    renderList();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-13: a rejected delete routes to sign-in and clears the busy state', async () => {
    const user = userEvent.setup();
    deleteBankMock.mockRejectedValue(new Error('401'));
    renderList();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Delete account', hidden: true })
      ).toBeEnabled()
    );
  });
});

describe('custom prices (T42)', () => {
  it('N-06: customer custom price delete UNAUTHORIZED routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    deleteCustomPriceMock.mockResolvedValue(unauthorized());
    render(
      <>
        <CustomerCustomPrices
          customerId="cust-1"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          customPrices={[customPrice as any]}
        />
        <CustomerModalContainer />
      </>
    );
    const rowTrigger = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
    await user.click(rowTrigger);
    await user.click(await screen.findByText('Delete'));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-06: product custom price delete UNAUTHORIZED routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    deleteCustomPriceMock.mockResolvedValue(unauthorized());
    render(
      <>
        <ProductCustomPrices
          productId="prod-1"
          productName="Widget"
          productPrice={10}
          productCurrency="USD"
          productUnit="pcs"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          customPrices={[customPrice as any]}
        />
        <ProductModalContainer />
      </>
    );
    const rowTrigger = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
    await user.click(rowTrigger);
    await user.click(await screen.findByText('Delete'));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });
});

const sessionUser = {
  id: 'u1',
  name: 'Ann',
  email: 'ann@example.com',
  image: null,
} as unknown as React.ComponentProps<typeof ProfileSettings>['user'];

describe('profile settings (T42)', () => {
  it('N-06: updateProfile UNAUTHORIZED routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue(unauthorized());
    render(
      <>
        <ProfileSettings user={sessionUser} />
        <SettingsModalContainer />
      </>
    );
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });
});
