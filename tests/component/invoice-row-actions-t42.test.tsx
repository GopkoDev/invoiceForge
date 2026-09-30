// @vitest-environment jsdom
// T42 (review-2026-09-28 N-05, N-06; AC-21): every InvoiceRowActions / RelatedInvoicesList action
// call site routes UNAUTHORIZED (and a `{ unauthorized: true }` PDF result) to sign-in.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail, ok } from '@/types/actions';
import type { InvoiceListItem } from '@/types/invoice/types';

const getInvoiceMock = vi.fn();
const duplicateMock = vi.fn();
const deleteMock = vi.fn();
const statusMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  duplicateInvoice: (...a: unknown[]) => duplicateMock(...a),
  deleteInvoice: (...a: unknown[]) => deleteMock(...a),
  updateInvoiceStatus: (...a: unknown[]) => statusMock(...a),
  getInvoice: (...a: unknown[]) => getInvoiceMock(...a),
}));

const downloadMock = vi.fn();
const printMock = vi.fn();
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  downloadInvoicePdf: (...a: unknown[]) => downloadMock(...a),
  printInvoicePdf: (...a: unknown[]) => printMock(...a),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({
    open: vi.fn(),
    close: vi.fn(),
    isOpen: false,
    props: undefined,
  }),
}));

const { InvoiceRowActions } =
  await import('@/components/invoices/invoice-row-actions');
const { RelatedInvoicesList } =
  await import('@/components/invoices/related-invoices-list');

const assignMock = vi.fn();
const SIGN_IN = '/api/auth/clear-session';

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

const unauthorized = () => fail('UNAUTHORIZED', 'Not signed in.');

beforeEach(() => {
  for (const m of [
    getInvoiceMock,
    duplicateMock,
    deleteMock,
    statusMock,
    downloadMock,
    printMock,
    toastError,
    assignMock,
  ]) {
    m.mockReset();
  }
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignMock },
    writable: true,
  });
});

describe('InvoiceRowActions (T42)', () => {
  async function pick(label: string) {
    const user = userEvent.setup();
    render(
      <InvoiceRowActions
        invoiceId="inv-1"
        invoiceNumber="INV-0001"
        status="DRAFT"
      />
    );
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await user.click(await screen.findByText(label));
  }

  it('N-05: Download PDF with an unauthorized logo result routes to sign-in', async () => {
    getInvoiceMock.mockResolvedValue(ok({ id: 'inv-1' }));
    downloadMock.mockResolvedValue({ success: false, unauthorized: true });
    await pick('Download PDF');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });

  it('N-05: Print with an unauthorized logo result routes to sign-in', async () => {
    getInvoiceMock.mockResolvedValue(ok({ id: 'inv-1' }));
    printMock.mockResolvedValue({ success: false, unauthorized: true });
    await pick('Print');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });

  it('N-05: View Document UNAUTHORIZED routes to sign-in, no toast', async () => {
    getInvoiceMock.mockResolvedValue(unauthorized());
    await pick('View Document');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-06: Duplicate UNAUTHORIZED routes to sign-in, no toast', async () => {
    duplicateMock.mockResolvedValue(unauthorized());
    await pick('Duplicate');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-06: Delete UNAUTHORIZED routes to sign-in, no toast', async () => {
    deleteMock.mockResolvedValue(unauthorized());
    await pick('Delete');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-06: status change UNAUTHORIZED routes to sign-in, no toast', async () => {
    statusMock.mockResolvedValue(unauthorized());
    await pick('Mark as Pending');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('RelatedInvoicesList (T42)', () => {
  async function pick(label: string) {
    const user = userEvent.setup();
    render(
      <RelatedInvoicesList
        invoices={[invoice]}
        entityType="customer"
        entityId="cust-1"
      />
    );
    await user.click(screen.getAllByRole('button', { name: '' })[0]);
    await user.click(await screen.findByText(label));
  }

  it('N-05: Download with an unauthorized logo result routes to sign-in', async () => {
    getInvoiceMock.mockResolvedValue(ok({ id: 'inv-1' }));
    downloadMock.mockResolvedValue({ success: false, unauthorized: true });
    await pick('Download');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });

  it('N-05: Print with an unauthorized logo result routes to sign-in', async () => {
    getInvoiceMock.mockResolvedValue(ok({ id: 'inv-1' }));
    printMock.mockResolvedValue({ success: false, unauthorized: true });
    await pick('Print');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });

  it('N-05: View UNAUTHORIZED routes to sign-in, no toast', async () => {
    getInvoiceMock.mockResolvedValue(unauthorized());
    await pick('View');
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
    expect(toastError).not.toHaveBeenCalled();
  });
});
