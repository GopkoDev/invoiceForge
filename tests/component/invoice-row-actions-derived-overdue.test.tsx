// @vitest-environment jsdom
// T08 (AC-24, SCR-05): a derived-overdue row (the services return status OVERDUE for a past-due
// pending invoice) offers Mark as Paid and Cancel but neither Mark as Overdue nor Mark as Pending;
// a refused Mark as Overdue shows the server message verbatim and refreshes the row.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { statusMock, toastError, toastSuccess, refreshMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock, replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: vi.fn(),
  duplicateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: statusMock,
}));
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  downloadInvoicePdf: vi.fn(),
  printInvoicePdf: vi.fn(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));

const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');
const { InvoiceStatusBadge } = await import('@/components/invoices/invoice-status-badge');

const REFUSAL =
  'This invoice is overdue because its due date has passed. You can still mark it paid.';

beforeEach(() => {
  for (const m of [statusMock, toastError, toastSuccess, refreshMock]) m.mockReset();
});

async function openMenu(status: 'PENDING' | 'OVERDUE') {
  const user = userEvent.setup();
  const onDataChange = vi.fn();
  render(
    <InvoiceRowActions
      invoiceId="inv-1"
      invoiceNumber="INV-0001"
      status={status}
      onDataChange={onDataChange}
    />
  );
  await user.click(screen.getByRole('button', { name: /actions for/i }));
  return { user, onDataChange };
}

describe('InvoiceRowActions for a derived-overdue invoice (AC-24)', () => {
  it('shows the Overdue badge', () => {
    render(<InvoiceStatusBadge status="OVERDUE" />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('offers Mark as Paid and Cancel Invoice but not Mark as Overdue or Mark as Pending', async () => {
    await openMenu('OVERDUE');
    expect(await screen.findByText('Mark as Paid')).toBeInTheDocument();
    expect(screen.getByText('Cancel Invoice')).toBeInTheDocument();
    expect(screen.queryByText('Mark as Overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark as Pending')).not.toBeInTheDocument();
  });

  it('Mark as Paid succeeds with a success toast', async () => {
    statusMock.mockResolvedValue({ success: true, data: { status: 'PAID', paidAt: null } });
    const { user, onDataChange } = await openMenu('OVERDUE');
    await user.click(await screen.findByText('Mark as Paid'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Invoice marked as paid'));
    expect(statusMock).toHaveBeenCalledWith('inv-1', 'PAID');
    expect(onDataChange).toHaveBeenCalled();
  });

  it('a refused Mark as Overdue shows the message verbatim and refreshes the row', async () => {
    statusMock.mockResolvedValue({ success: false, code: 'VALIDATION', error: REFUSAL });
    const { user, onDataChange } = await openMenu('PENDING');
    await user.click(await screen.findByText('Mark as Overdue'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(REFUSAL));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(onDataChange).toHaveBeenCalled();
  });
});
