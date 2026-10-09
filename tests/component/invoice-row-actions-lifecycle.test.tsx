// @vitest-environment jsdom
// invoice-integrity T15 (spec.md §5 AC-04, AC-05, AC-06, AC-10; screens.md SCR-01, SCR-04) — the row menu
// offers only the moves the shared transition table allows, Cancel Invoice asks for confirmation
// (SCR-04) and calls updateInvoiceStatus only on confirm, and a STATUS_NOT_ALLOWED refusal shows the
// server message verbatim and redraws the row's menu at details.currentStatus.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { statusMock, deleteMock, toastError, toastSuccess, refreshMock, confirmOpen, confirmClose } = vi.hoisted(
  () => ({
    statusMock: vi.fn(),
    deleteMock: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    refreshMock: vi.fn(),
    confirmOpen: vi.fn(),
    confirmClose: vi.fn(),
  })
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock, replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: vi.fn(),
  duplicateInvoice: vi.fn(),
  deleteInvoice: deleteMock,
  updateInvoiceStatus: statusMock,
}));
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({ downloadInvoicePdf: vi.fn(), printInvoicePdf: vi.fn() }));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));
vi.mock('@/store/use-modal-store', () => ({
  useModal: (name: string) =>
    name === 'confirmationModal'
      ? { open: confirmOpen, close: confirmClose, isOpen: false, props: undefined }
      : { open: vi.fn(), close: vi.fn(), isOpen: false, props: undefined },
}));

const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');

type Status = 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
const FUTURE = '2999-01-10T00:00:00.000Z';
const PAST = '2020-01-10T00:00:00.000Z';

const MOVES = ['Mark as Pending', 'Mark as Paid', 'Mark as Overdue', 'Cancel Invoice', 'Delete', 'Edit'];

beforeEach(() => {
  for (const m of [statusMock, deleteMock, toastError, toastSuccess, refreshMock, confirmOpen, confirmClose]) m.mockReset();
});

async function openMenu(status: Status, dueDate = FUTURE, storedStatus?: Status) {
  const user = userEvent.setup();
  render(
    <InvoiceRowActions
      invoiceId="inv-1"
      invoiceNumber="INV-0042"
      status={status}
      storedStatus={storedStatus}
      dueDate={dueDate}
      timeZone="UTC"
    />
  );
  await user.click(screen.getByRole('button', { name: /actions for/i }));
  await screen.findByText('Duplicate');
  return user;
}

function offered(): string[] {
  return MOVES.filter((label) => screen.queryByText(label) !== null);
}

describe('InvoiceRowActions — menu per stored status (SCR-01 wireframe A)', () => {
  it.each([
    ['DRAFT', FUTURE, ['Mark as Pending', 'Delete', 'Edit']],
    ['PENDING', FUTURE, ['Mark as Paid', 'Mark as Overdue', 'Cancel Invoice', 'Edit']],
    ['OVERDUE', FUTURE, ['Mark as Pending', 'Mark as Paid', 'Cancel Invoice', 'Edit']],
    ['OVERDUE', PAST, ['Mark as Paid', 'Cancel Invoice', 'Edit']],
    ['PAID', FUTURE, ['Mark as Pending', 'Edit']],
    ['CANCELLED', FUTURE, []],
  ] as const)('%s (due %s) offers %j', async (status, due, expected) => {
    await openMenu(status, due);
    expect(offered().sort()).toEqual([...expected].sort());
    // View, Download, Print and Duplicate are always there.
    for (const label of ['View Document', 'Download PDF', 'Print', 'Duplicate']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('Cancel Invoice — SCR-04', () => {
  it('opens the confirmation with the SCR-04 texts and sends nothing until confirmed', async () => {
    const user = await openMenu('PENDING');
    await user.click(screen.getByText('Cancel Invoice'));
    expect(statusMock).not.toHaveBeenCalled();
    expect(confirmOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Cancel invoice INV-0042?',
        description:
          "A cancelled invoice is final. It stays in your list and can still be viewed, downloaded, printed and duplicated, but it can't be changed or deleted.",
        confirmText: 'Cancel invoice',
        cancelText: 'Keep invoice',
        variant: 'destructive',
      })
    );
  });

  it('confirm calls updateInvoiceStatus(CANCELLED), closes the dialog and toasts', async () => {
    statusMock.mockResolvedValue({ success: true, data: { status: 'CANCELLED', paidAt: null } });
    const user = await openMenu('OVERDUE');
    await user.click(screen.getByText('Cancel Invoice'));
    await confirmOpen.mock.calls[0][0].onConfirm();
    expect(statusMock).toHaveBeenCalledWith('inv-1', 'CANCELLED');
    expect(confirmClose).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Invoice marked as cancelled');
  });

  it('a refused cancel (paid elsewhere) closes the dialog, shows the error and redraws at the current status', async () => {
    statusMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: "An invoice can't move from PAID to CANCELLED.",
      details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'PAID', suggestion: null },
    });
    const user = await openMenu('PENDING');
    await user.click(screen.getByText('Cancel Invoice'));
    await confirmOpen.mock.calls[0][0].onConfirm();
    expect(confirmClose).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("An invoice can't move from PAID to CANCELLED.");
    expect(refreshMock).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await screen.findByText('Duplicate');
    expect(offered().sort()).toEqual(['Edit', 'Mark as Pending']);
  });
});

describe('refusals (AC-10 list half)', () => {
  it('Mark as Paid on a row cancelled elsewhere shows the message verbatim and redraws the menu as Cancelled', async () => {
    statusMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.",
      details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'CANCELLED', suggestion: 'DUPLICATE' },
    });
    const user = await openMenu('PENDING');
    await user.click(screen.getByText('Mark as Paid'));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft."
      )
    );
    expect(refreshMock).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await screen.findByText('Duplicate');
    expect(offered()).toEqual([]);
  });

  it('Mark as Pending on a draft that breaks a draft rule shows the joined messages; the row stays a draft', async () => {
    statusMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'This account is in USD while the invoice is in EUR.',
      fieldErrors: { bankAccountId: ['This account is in USD while the invoice is in EUR.'] },
    });
    const user = await openMenu('DRAFT');
    await user.click(screen.getByText('Mark as Pending'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This account is in USD while the invoice is in EUR.'));
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await screen.findByText('Duplicate');
    expect(offered().sort()).toEqual(['Delete', 'Edit', 'Mark as Pending']);
  });

  it('a refused delete (issued elsewhere) shows the message and redraws at the current status', async () => {
    deleteMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'Only drafts can be deleted. An issued invoice can be cancelled instead; a cancelled invoice is final and stays listed.',
      details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'PENDING', suggestion: null },
    });
    const user = await openMenu('DRAFT');
    await user.click(screen.getByText('Delete'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/^Only drafts can be deleted/)));
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await screen.findByText('Duplicate');
    expect(offered().sort()).toEqual(['Cancel Invoice', 'Edit', 'Mark as Overdue', 'Mark as Paid']);
  });
});

describe('InvoiceRowActions — menu from the stored status (T27, F8, AC-04, AC-05)', () => {
  it('a stored-PENDING invoice past its due date reads Overdue but offers the stored-pending moves', async () => {
    await openMenu('OVERDUE', PAST, 'PENDING');
    expect(offered()).toEqual(['Mark as Paid', 'Mark as Overdue', 'Cancel Invoice', 'Edit']);
  });

  it('a stored-OVERDUE row with a due date today or later still offers Mark as Pending', async () => {
    await openMenu('OVERDUE', FUTURE, 'OVERDUE');
    expect(offered()).toEqual(['Mark as Pending', 'Mark as Paid', 'Cancel Invoice', 'Edit']);
  });
});
