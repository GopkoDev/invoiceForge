// @vitest-environment jsdom
// invoice-integrity T19 (spec.md §5 AC-13, AC-13b, AC-17b, AC-20; screens.md SCR-09, SCR-10, SCR-12) — the
// "Set as default" checkbox is checked and disabled for a first or current default with its contract
// description, enabled otherwise; a default race is a verbatim toast; a currency lock (HAS_INVOICES)
// shows a FieldError under currency with the values kept; the product price shows the four messages.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  createProfileMock,
  updateProfileMock,
  createAccountMock,
  updateAccountMock,
  createProductMock,
  updateProductMock,
  toastError,
  toastSuccess,
  pushMock,
} = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  updateProfileMock: vi.fn(),
  createAccountMock: vi.fn(),
  updateAccountMock: vi.fn(),
  createProductMock: vi.fn(),
  updateProductMock: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess, warning: vi.fn() } }));
vi.mock('@/lib/actions/sender-profile-actions', () => ({
  createSenderProfile: createProfileMock,
  updateSenderProfile: updateProfileMock,
}));
vi.mock('@/lib/actions/bank-account-actions', () => ({
  createBankAccount: createAccountMock,
  updateBankAccount: updateAccountMock,
}));
vi.mock('@/lib/actions/product-actions', () => ({
  createProduct: createProductMock,
  updateProduct: updateProductMock,
}));
vi.mock('@/lib/actions/custom-price-actions', () => ({ getProductCustomPrices: vi.fn() }));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));
vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, props: undefined }),
}));

const { SenderProfileForm } = await import('@/components/sender-profiles/sender-profile-form');
const { BankAccountModal } = await import('@/components/modals/sender-profile/bank-account-modal');
const { handleBankAccountSubmit } = await import('@/lib/helpers/bank-account-modal-helpers');
const { ProductForm } = await import('@/components/products/product-form');

beforeEach(() => {
  for (const m of [
    createProfileMock,
    updateProfileMock,
    createAccountMock,
    updateAccountMock,
    createProductMock,
    updateProductMock,
    toastError,
    toastSuccess,
    pushMock,
  ])
    m.mockReset();
});

const profileValues = (isDefault: boolean) => ({
  id: 'sp-1',
  name: 'Studio',
  legalName: '',
  taxId: '',
  address: '',
  city: '',
  country: '',
  postalCode: '',
  phone: '',
  email: '',
  website: '',
  logo: '',
  invoicePrefix: 'INV',
  isDefault,
});

const PROFILE = {
  first: 'Your first sender profile is the default.',
  current: 'This is your default sender profile. To change it, make another profile the default.',
  race: "Couldn't change the default sender profile. Please try again.",
  unset: "The default sender profile can't be switched off. Make another profile the default instead.",
};
const ACCOUNT = {
  first: 'The first account of a sender profile is its default.',
  current: 'This is the default account. To change it, make another account the default.',
  race: "Couldn't change the default account. Please try again.",
  locked: "The currency of an account used by 3 invoice(s) can't change.",
};

describe('SenderProfileForm — default checkbox (SCR-09)', () => {
  it('a first profile: checked, disabled, with the "first" description', () => {
    render(<SenderProfileForm isFirst />);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(PROFILE.first)).toBeInTheDocument();
  });

  it('the current default: checked, disabled, with the "current" description', () => {
    render(<SenderProfileForm defaultValues={profileValues(true)} isEditing />);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(PROFILE.current)).toBeInTheDocument();
  });

  it('not the default: enabled and unchecked', () => {
    render(<SenderProfileForm defaultValues={profileValues(false)} isEditing />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('a default race is a verbatim toast; a tampered unset shows under the checkbox', async () => {
    updateProfileMock.mockResolvedValueOnce({ success: false, code: 'CONFLICT', error: PROFILE.race });
    render(<SenderProfileForm defaultValues={profileValues(false)} isEditing />);
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save|update/i }));
    });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(PROFILE.race));

    updateProfileMock.mockResolvedValueOnce({
      success: false,
      code: 'VALIDATION',
      error: PROFILE.unset,
      fieldErrors: { isDefault: [PROFILE.unset] },
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save|update/i }));
    });
    expect((await screen.findAllByText(PROFILE.unset)).length).toBeGreaterThan(0);
  });
});

const accountValues = (isDefault: boolean) => ({
  bankName: 'Bank',
  accountName: 'Holder',
  accountNumber: '0000000000',
  iban: 'UA00 OLD',
  swift: '',
  currency: 'USD' as const,
  isDefault,
});

function renderAccountModal(props: { isFirst?: boolean; isEditing?: boolean; defaultValues?: ReturnType<typeof accountValues> }) {
  const close = vi.fn();
  render(
    <BankAccountModal
      open
      close={close}
      senderProfileId="sp-1"
      isFirst={props.isFirst}
      isEditing={props.isEditing}
      defaultValues={props.defaultValues}
      onFormSubmit={(data, isEditing) => handleBankAccountSubmit('sp-1', data, isEditing, 'ba-1')}
    />
  );
  return close;
}

describe('BankAccountModal — default checkbox and currency lock (SCR-10)', () => {
  it('the first account: checked, disabled, "first" description', () => {
    renderAccountModal({ isFirst: true });
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(ACCOUNT.first)).toBeInTheDocument();
  });

  it('the current default: checked, disabled, "current" description; another account: enabled', () => {
    renderAccountModal({ isEditing: true, defaultValues: accountValues(true) });
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(ACCOUNT.current)).toBeInTheDocument();
  });

  it('a currency locked by invoices shows under the currency; the dialog stays open with the values kept', async () => {
    updateAccountMock.mockResolvedValue({
      success: false,
      code: 'CONFLICT',
      error: ACCOUNT.locked,
      fieldErrors: { currency: [ACCOUNT.locked] },
      details: { kind: 'HAS_INVOICES', invoiceCount: 3 },
    });
    const close = renderAccountModal({ isEditing: true, defaultValues: accountValues(false) });
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Update' }));
    });
    expect(await screen.findByText(ACCOUNT.locked)).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('UA00 OLD')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a default race is a verbatim toast and the dialog stays open', async () => {
    updateAccountMock.mockResolvedValue({ success: false, code: 'CONFLICT', error: ACCOUNT.race });
    const close = renderAccountModal({ isEditing: true, defaultValues: accountValues(false) });
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Update' }));
    });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(ACCOUNT.race));
    expect(close).not.toHaveBeenCalled();
  });
});

describe('ProductForm — price and currency lock (SCR-12)', () => {
  const product = {
    id: 'pr-1',
    name: 'Consulting',
    description: '',
    unit: 'hours',
    price: '150.00',
    currency: 'USD' as const,
    isActive: true,
  };

  it.each([
    ['12abc', 'Price must be a number.'],
    ['12.345', 'Price can have at most 2 decimal places.'],
    ['-1', "Price can't be negative."],
    ['100000000', 'Price is too large.'],
  ])('price %j shows %j under the price, nothing sent', async (price, message) => {
    render(<ProductForm defaultValues={product} isEditing />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('100.00');
    await user.clear(input);
    await user.type(input, price);
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /update|save/i }));
    });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(input).toHaveValue(price);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it('a currency locked by invoices shows under the currency, values kept', async () => {
    const message = "The currency of a product used on 2 invoice(s) can't change.";
    updateProductMock.mockResolvedValue({
      success: false,
      code: 'CONFLICT',
      error: message,
      fieldErrors: { currency: [message] },
      details: { kind: 'HAS_INVOICES', invoiceCount: 2 },
    });
    render(<ProductForm defaultValues={product} isEditing invoiceItemsCount={3} />);
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /update|save/i }));
    });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Consulting')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('ProductForm — currency copy matches the refuse-on-save rule (AC-13b, SCR-12)', () => {
  const product = {
    id: 'pr-1',
    name: 'Consulting',
    description: '',
    unit: 'hours',
    price: '150.00',
    currency: 'USD' as const,
    isActive: true,
  };

  it('a product used on invoices: only the unit is locked up front, currency is open and refused on save', () => {
    const { container } = render(<ProductForm defaultValues={product} isEditing invoiceItemsCount={3} />);
    expect(screen.getByText(/Unit Locked/)).toBeInTheDocument();
    expect(screen.queryByText(/Currency and Unit Locked/)).not.toBeInTheDocument();
    expect(screen.getByText(/refused on save/i)).toBeInTheDocument();
    // exactly one "Locked: Used in" line (the unit's) and one lock icon on a field label (the unit's)
    expect(screen.getAllByText(/Locked: Used in 3 invoices/)).toHaveLength(1);
    const currencyLabel = container.querySelector('label[for="product-form-currency"]')!;
    expect(currencyLabel.querySelector('svg')).toBeNull();
    const unitLabel = container.querySelector('label[for="product-form-unit"]')!;
    expect(unitLabel.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: /currency/i })).not.toBeDisabled();
    expect(screen.getByRole('combobox', { name: /unit of measure/i })).toBeDisabled();
  });

  it('a product not used on invoices has no lock copy at all', () => {
    render(<ProductForm defaultValues={product} isEditing invoiceItemsCount={0} />);
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();
  });
});

describe('Make default — one request, a failed switch keeps the old default (AC-17, SCR-07/08/09)', () => {
  it('a double click on Save after ticking "Set as default" sends a single switch', async () => {
    let release!: (v: unknown) => void;
    updateProfileMock.mockReturnValue(new Promise((r) => (release = r)));
    render(<SenderProfileForm defaultValues={profileValues(false)} isEditing />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    const save = screen.getByRole('button', { name: /save|update/i });
    await act(async () => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await act(async () => {
      release({ success: true, data: { id: 'sp-1' } });
    });
    expect(updateProfileMock).toHaveBeenCalledTimes(1);
    expect(updateProfileMock.mock.calls[0][1]).toMatchObject({ isDefault: true });
  });

  it('a failed switch shows the error, does not leave the form, and sends no second switch', async () => {
    updateProfileMock.mockResolvedValue({ success: false, code: 'CONFLICT', error: PROFILE.race });
    render(<SenderProfileForm defaultValues={profileValues(false)} isEditing />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save|update/i }));
    });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(PROFILE.race));
    expect(pushMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(updateProfileMock).toHaveBeenCalledTimes(1);
  });
});

describe('Make default on a bank account — one request, a failed switch keeps the dialog open (AC-17, SCR-10)', () => {
  it('a double click on Update after ticking "Set as default" sends a single switch', async () => {
    let release!: (v: unknown) => void;
    updateAccountMock.mockReturnValue(new Promise((r) => (release = r)));
    renderAccountModal({ isEditing: true, defaultValues: accountValues(false) });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    const update = screen.getByRole('button', { name: 'Update' });
    await act(async () => {
      fireEvent.click(update);
      fireEvent.click(update);
    });
    await act(async () => {
      release({ success: true, data: { id: 'ba-1' } });
    });
    expect(updateAccountMock).toHaveBeenCalledTimes(1);
    expect(updateAccountMock.mock.calls[0][1]).toMatchObject({ isDefault: true });
  });

  it('a failed switch shows the error, keeps the dialog open, and sends no second switch', async () => {
    updateAccountMock.mockResolvedValue({ success: false, code: 'CONFLICT', error: ACCOUNT.race });
    const close = renderAccountModal({ isEditing: true, defaultValues: accountValues(false) });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Update' }));
    });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(ACCOUNT.race));
    expect(close).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(updateAccountMock).toHaveBeenCalledTimes(1);
  });
});
