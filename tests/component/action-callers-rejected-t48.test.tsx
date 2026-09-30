// @vitest-environment jsdom
// T48 (review-2026-09-30 R-01..R-04; AC-21): the remaining action callers route UNAUTHORIZED and a
// rejected call to sign-in, never toast "Not signed in."/a generic error, never reject into the
// error boundary, and never leave a busy state or dialog stuck.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';
import type { InvoiceListItem } from '@/types/invoice/types';

const getInvoiceMock = vi.fn();
const duplicateMock = vi.fn();
const deleteMock = vi.fn();
const statusMock = vi.fn();
const updateInvoiceMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  duplicateInvoice: (...a: unknown[]) => duplicateMock(...a),
  deleteInvoice: (...a: unknown[]) => deleteMock(...a),
  updateInvoiceStatus: (...a: unknown[]) => statusMock(...a),
  getInvoice: (...a: unknown[]) => getInvoiceMock(...a),
  updateInvoice: (...a: unknown[]) => updateInvoiceMock(...a),
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn(),
}));

vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  downloadInvoicePdf: vi.fn(),
  printInvoicePdf: vi.fn(),
}));

const createCustomerMock = vi.fn();
vi.mock('@/lib/actions/customer-actions', () => ({
  createCustomer: (...a: unknown[]) => createCustomerMock(...a),
  updateCustomer: vi.fn(),
  getCustomers: vi.fn(),
}));

const createBankMock = vi.fn();
vi.mock('@/lib/actions/bank-account-actions', () => ({
  createBankAccount: (...a: unknown[]) => createBankMock(...a),
  updateBankAccount: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');
const { RelatedInvoicesList } = await import('@/components/invoices/related-invoices-list');
const { CustomerForm } = await import('@/components/customers/customer-form');
const { CustomPriceModal } = await import('@/components/modals/customer/custom-price-modal');
const { ContactCardActions } = await import(
  '@/components/layout/contacts/contact-card/contact-card-actions'
);
const { CustomerModalContainer } = await import(
  '@/components/modals/customer/customer-modal-container'
);
const { handleBankAccountSubmit } = await import('@/lib/helpers/bank-account-modal-helpers');
const { useInvoiceEditorStore } = await import(
  '@/store/invoice-editor-store/use-invoice-editor-store'
);
const { useModalStore } = await import('@/store/use-modal-store');

const assignMock = vi.fn();
const SIGN_IN = '/api/auth/clear-session';
const unauthorized = () => fail('UNAUTHORIZED', 'Not signed in.');

const invoice: InvoiceListItem = {
  id: 'inv-1',
  invoiceNumber: 'INV-0001',
  status: 'DRAFT',
  issueDate: new Date('2026-01-01'),
  dueDate: new Date('2026-01-31'),
  total: 100,
  currency: 'USD',
  customerName: 'Acme',
  senderName: 'Me',
  createdAt: new Date('2026-01-01'),
  paidAt: null,
};

beforeEach(() => {
  for (const m of [
    getInvoiceMock,
    duplicateMock,
    deleteMock,
    statusMock,
    updateInvoiceMock,
    createCustomerMock,
    createBankMock,
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

describe('InvoiceRowActions rejections (R-01, R-03)', () => {
  async function pick(label: string) {
    const user = userEvent.setup();
    render(<InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="DRAFT" />);
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await user.click(await screen.findByText(label));
  }

  it('R-01: a rejected Duplicate routes to sign-in and closes the menu', async () => {
    duplicateMock.mockRejectedValue(new Error('boom'));
    await pick('Duplicate');
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
  });

  it('R-01: a rejected Delete routes to sign-in and closes the menu', async () => {
    deleteMock.mockRejectedValue(new Error('boom'));
    await pick('Delete');
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('R-01: a rejected status change routes to sign-in', async () => {
    statusMock.mockRejectedValue(new Error('boom'));
    await pick('Mark as Pending');
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });

  it('R-03: a rejected Download PDF routes to sign-in', async () => {
    getInvoiceMock.mockRejectedValue(new Error('boom'));
    await pick('Download PDF');
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });

  it('R-03: a rejected View Document routes to sign-in, no toast', async () => {
    getInvoiceMock.mockRejectedValue(new Error('boom'));
    await pick('View Document');
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('RelatedInvoicesList rejections (R-03)', () => {
  it('a rejected Download routes to sign-in', async () => {
    getInvoiceMock.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<RelatedInvoicesList invoices={[invoice]} entityType="customer" entityId="c-1" />);
    await user.click(screen.getAllByRole('button', { name: '' })[0]);
    await user.click(await screen.findByText('Download'));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });
});

describe('CustomerForm (R-02, R-03)', () => {
  async function submit() {
    const user = userEvent.setup();
    render(<CustomerForm />);
    await user.type(screen.getByLabelText(/Contact Name/), 'Jane');
    await user.click(screen.getByRole('button', { name: 'Create Customer' }));
  }

  it('R-02: UNAUTHORIZED routes to sign-in, no toast', async () => {
    createCustomerMock.mockResolvedValue(unauthorized());
    await submit();
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('R-03: a rejected save routes to sign-in, no toast', async () => {
    createCustomerMock.mockRejectedValue(new Error('boom'));
    await submit();
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('handleBankAccountSubmit (R-02, R-03)', () => {
  const data = {} as never;

  it('R-02: UNAUTHORIZED routes to sign-in, no toast', async () => {
    createBankMock.mockResolvedValue(unauthorized());
    await handleBankAccountSubmit('sp-1', data, false);
    expect(assignMock).toHaveBeenCalledWith(SIGN_IN);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('R-03: a rejection routes to sign-in, no toast', async () => {
    createBankMock.mockRejectedValue(new Error('boom'));
    await handleBankAccountSubmit('sp-1', data, false);
    expect(assignMock).toHaveBeenCalledWith(SIGN_IN);
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('CustomPriceModal (R-02, R-03)', () => {
  async function submit(onFormSubmit: () => Promise<unknown>) {
    const user = userEvent.setup();
    render(
      <CustomPriceModal
        open
        close={vi.fn()}
        mode="selectProduct"
        fixedCustomerId="cust_1"
        fixedProductId="prod_1"
        onFormSubmit={onFormSubmit as never}
        onLoadProducts={vi.fn().mockResolvedValue([])}
      />
    );
    const price = screen.getByRole('textbox', { name: /Custom Price/ });
    await user.clear(price);
    await user.type(price, '50');
    await user.click(screen.getByRole('button', { name: 'Create' }));
  }

  it('R-02: UNAUTHORIZED routes to sign-in, no toast', async () => {
    await submit(() => Promise.resolve(unauthorized()));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('R-03: a rejected submit routes to sign-in', async () => {
    await submit(() => Promise.reject(new Error('boom')));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });
});

describe('invoice editor save (R-03)', () => {
  it('a rejected save routes to sign-in instead of "Error saving invoice"', async () => {
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.setState({ invoiceId: 'inv-1' });
    updateInvoiceMock.mockRejectedValue(new Error('boom'));
    await useInvoiceEditorStore.getState().saveInvoice();
    expect(assignMock).toHaveBeenCalledWith(SIGN_IN);
    expect(toastError).not.toHaveBeenCalledWith('Error saving invoice');
  });
});

describe('ContactCardActions rejected delete (R-04)', () => {
  it('re-enables the buttons and routes to sign-in when deleteAction rejects', async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <>
        <ContactCardActions
          id="cust-1"
          name="Acme"
          detailRoute="/customers/cust-1"
          deleteAction={deleteAction}
          entityLabel="Customer"
          showPreview={false}
        />
        <CustomerModalContainer />
      </>
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    const trigger = document.querySelector('button svg.lucide-trash-2')!.closest('button')!;
    await waitFor(() => expect(trigger).toBeEnabled());
  });
});
